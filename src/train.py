"""Train the semantic change-detection model.

    python src/train.py                 # 40 epochs, batch 8, bf16
    python src/train.py --epochs 15 --freeze-encoder     # the "won't converge" switch

Checkpoints land in weights/: best.pt (highest val SeK) and last.pt (every epoch,
so an overnight crash costs one epoch, not the run).
"""

import argparse
import json
import math
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader

from classes import N_SEM, NAMES
from dataset import SecondDataset, read_ids
from metrics import SCDMetrics
from model import build_model

ROOT = Path(__file__).resolve().parents[1]
WEIGHTS = ROOT / "weights"
CACHE = ROOT / "data" / "class_weights.json"


def compute_class_weights(device):
    """Inverse-sqrt frequency over the training split, computed once and cached.

    Playgrounds and water are genuinely rare (0.5% and 1.2% of changed pixels in a
    300-pair sample), so without this the model simply never predicts them.
    """
    if CACHE.exists():
        counts = np.array(json.loads(CACHE.read_text())["counts"], dtype=np.float64)
    else:
        from tqdm import tqdm
        from dataset import load_pair
        counts = np.zeros(N_SEM + 1, dtype=np.int64)
        for pid in tqdm(read_ids("train"), desc="class freq", unit="pair"):
            _, _, y1, y2 = load_pair(pid)
            counts += np.bincount(y1.ravel(), minlength=N_SEM + 1)
            counts += np.bincount(y2.ravel(), minlength=N_SEM + 1)
        CACHE.write_text(json.dumps({"counts": counts.tolist()}, indent=2))
        counts = counts.astype(np.float64)

    freq = counts[1:]                       # drop no-change: the BCE head owns it
    w = 1.0 / np.sqrt(np.maximum(freq, 1.0))
    w = w / w.mean()
    print("class weights: " + "  ".join(f"{NAMES[i+1]}={w[i]:.3f}" for i in range(N_SEM)))
    return torch.tensor(w, dtype=torch.float32, device=device)


def make_scheduler(opt, total_steps, warmup_frac=0.05):
    warmup = max(1, int(total_steps * warmup_frac))

    def fn(step):
        if step < warmup:
            return step / warmup
        prog = (step - warmup) / max(1, total_steps - warmup)
        return 0.5 * (1.0 + math.cos(math.pi * min(prog, 1.0)))

    return torch.optim.lr_scheduler.LambdaLR(opt, fn)


@torch.no_grad()
def evaluate(model, loader, device, limit=None):
    model.eval()
    m = SCDMetrics()
    for i, (im1, im2, y1, y2, _chg, _ids) in enumerate(loader):
        if limit and i >= limit:
            break
        im1, im2 = im1.to(device, non_blocking=True), im2.to(device, non_blocking=True)
        with torch.autocast("cuda", dtype=torch.bfloat16, enabled=device == "cuda"):
            p1, p2, _ = model.predict(im1, im2)
        m.update(y1, p1.cpu())
        m.update(y2, p2.cpu())
    model.train()
    return m


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--epochs", type=int, default=40)
    ap.add_argument("--batch-size", type=int, default=8)
    ap.add_argument("--lr", type=float, default=3e-4)
    ap.add_argument("--wd", type=float, default=1e-4)
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--seed", type=int, default=1337)
    ap.add_argument("--chg-weight", type=float, default=1.0)
    ap.add_argument("--freeze-encoder", action="store_true")
    ap.add_argument("--eval-batches", type=int, default=40,
                    help="val batches per epoch; 0 = full test split")
    args = ap.parse_args()

    torch.manual_seed(args.seed)
    np.random.seed(args.seed)
    torch.backends.cudnn.benchmark = True
    device = "cuda" if torch.cuda.is_available() else "cpu"
    if device != "cuda":
        print("WARNING: no CUDA -- this will take days, not minutes.")
    WEIGHTS.mkdir(exist_ok=True)
    print(f"device={device}  seed={args.seed}  epochs={args.epochs}  bs={args.batch_size}")

    train_ds = SecondDataset("train", augment=True)
    val_ds = SecondDataset("test", augment=False)
    print(f"train {len(train_ds)} pairs / val {len(val_ds)} pairs (held out, never trained on)")

    common = dict(num_workers=args.workers, pin_memory=(device == "cuda"),
                  persistent_workers=args.workers > 0)
    train_ld = DataLoader(train_ds, batch_size=args.batch_size, shuffle=True,
                          drop_last=True, **common)
    val_ld = DataLoader(val_ds, batch_size=args.batch_size, shuffle=False, **common)

    model = build_model(pretrained=True, device=device)
    if args.freeze_encoder:
        for p in model.encoder.parameters():
            p.requires_grad = False
        print("encoder frozen -- decoder + heads only")

    cls_w = compute_class_weights(device)
    ce = nn.CrossEntropyLoss(weight=cls_w, ignore_index=-1)
    bce = nn.BCEWithLogitsLoss()

    params = [p for p in model.parameters() if p.requires_grad]
    opt = torch.optim.AdamW(params, lr=args.lr, weight_decay=args.wd)
    total_steps = args.epochs * len(train_ld)
    sched = make_scheduler(opt, total_steps)

    best_sek = -1.0
    history = []
    t_start = time.time()

    for epoch in range(1, args.epochs + 1):
        model.train()
        running = ep_sem = ep_chg = 0.0
        t0 = time.time()
        for it, (im1, im2, y1, y2, chg, _ids) in enumerate(train_ld):
            im1 = im1.to(device, non_blocking=True)
            im2 = im2.to(device, non_blocking=True)
            y1 = y1.to(device, non_blocking=True)
            y2 = y2.to(device, non_blocking=True)
            chg = chg.to(device, non_blocking=True)

            # Shift 1..6 -> 0..5 and mark unchanged pixels -1 so ignore_index drops
            # them: the semantic heads are supervised only where something changed.
            t1 = y1.long() - 1
            t2 = y2.long() - 1

            opt.zero_grad(set_to_none=True)
            with torch.autocast("cuda", dtype=torch.bfloat16, enabled=device == "cuda"):
                sem1, sem2, chg_logit = model(im1, im2)
                l_sem = ce(sem1, t1) + ce(sem2, t2)
                l_chg = bce(chg_logit[:, 0], chg)
                loss = l_sem + args.chg_weight * l_chg

            loss.backward()
            torch.nn.utils.clip_grad_norm_(params, 5.0)
            opt.step()
            sched.step()

            running += loss.item()
            ep_sem += l_sem.item()
            ep_chg += l_chg.item()
            if it % 50 == 0:
                print(f"  ep{epoch:02d} [{it:4d}/{len(train_ld)}] loss {loss.item():.4f} "
                      f"(sem {l_sem.item():.4f} chg {l_chg.item():.4f}) "
                      f"lr {sched.get_last_lr()[0]:.2e}", flush=True)

        n = len(train_ld)
        m = evaluate(model, val_ld, device, limit=args.eval_batches or None)
        s = m.summary()
        dt = time.time() - t0
        print(f"epoch {epoch:02d}/{args.epochs}  loss {running/n:.4f} "
              f"(sem {ep_sem/n:.4f} chg {ep_chg/n:.4f})  {dt:.0f}s")
        print(m.format(), flush=True)

        history.append({"epoch": epoch, "loss": running / n, **{
            k: v for k, v in s.items() if k != "per_class_iou"}})

        ckpt = {"model": model.state_dict(), "epoch": epoch, "args": vars(args),
                "metrics": s}
        torch.save(ckpt, WEIGHTS / "last.pt")
        if s["sek"] > best_sek:
            best_sek = s["sek"]
            torch.save(ckpt, WEIGHTS / "best.pt")
            print(f"  * new best SeK {best_sek:.4f} -> weights/best.pt", flush=True)

        (WEIGHTS / "history.json").write_text(json.dumps(history, indent=2))

    print(f"\ndone in {(time.time()-t_start)/60:.1f} min. best val SeK {best_sek:.4f}")
    print("running full evaluation on the complete held-out split...")
    m = evaluate(model, val_ld, device, limit=None)
    print(m.format())
    (WEIGHTS / "final_metrics.json").write_text(json.dumps(m.summary(), indent=2))


if __name__ == "__main__":
    main()
