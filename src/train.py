"""Train the semantic change-detection model.

    python src/train.py                 # 40 epochs, batch 8, bf16
    python src/train.py --backbone resnet34 --epochs 80      # run 3 setup
    python src/train.py --smoke         # end-to-end check in ~1 min, writes weights/smoke/
    python src/train.py --epochs 15 --freeze-encoder     # the "won't converge" switch

Trains on train.txt minus every 10th pair ("fit"); that 10% ("val") picks best.pt
and tunes the change threshold. test.txt is only touched for the final report.

Checkpoints land in weights/: best.pt (highest val SeK) and last.pt (every epoch,
so an overnight crash costs one epoch, not the run). After the last epoch best.pt
gets `thresh` and `tta` keys that analyze.py and the API use at inference.
"""

import argparse
import json
import math
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import DataLoader

from classes import N_SEM, NAMES
from dataset import SecondDataset, read_ids
from metrics import SCDMetrics
from model import BACKBONES, build_model

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


def dice_loss(logit, target, eps=1.0):
    """Soft Dice over the whole batch. BCE scores pixels independently, so with ~20%
    changed pixels it is happy to under-predict; Dice scores the overlap directly."""
    p = torch.sigmoid(logit.float())
    t = target.float()
    inter = (p * t).sum()
    return 1.0 - (2.0 * inter + eps) / (p.sum() + t.sum() + eps)


def consistency_loss(sem1, sem2, y1, y2):
    """Semantic-change consistency (after Bi-SRNet).

    The CE loss never sees unchanged pixels (~80% of the frame), so the semantic
    features get no signal there. This pulls the two timesteps' class distributions
    together where nothing changed and pushes them apart where the class changed.
    Changed-but-same-class pixels (a rebuilt building) are left out.
    """
    cos = F.cosine_similarity(sem1.float().softmax(1), sem2.float().softmax(1), dim=1)
    unchanged = y1 == 0
    moved = (y1 != 0) & (y1 != y2)
    keep = unchanged | moved
    if not keep.any():
        return cos.new_zeros(())
    per_px = torch.where(unchanged, 1.0 - cos, cos.clamp(min=0.0))
    return per_px[keep].mean()


@torch.no_grad()
def evaluate(model, loader, device, limit=None, thresh=0.5, tta=False):
    model.eval()
    m = SCDMetrics()
    for i, (im1, im2, y1, y2, _chg, _ids) in enumerate(loader):
        if limit and i >= limit:
            break
        im1, im2 = im1.to(device, non_blocking=True), im2.to(device, non_blocking=True)
        y1, y2 = y1.to(device, non_blocking=True), y2.to(device, non_blocking=True)
        with torch.autocast("cuda", dtype=torch.bfloat16, enabled=device == "cuda"):
            p1, p2, _ = model.predict(im1, im2, thresh=thresh, tta=tta)
        m.update(y1, p1)
        m.update(y2, p2)
    model.train()
    return m


@torch.no_grad()
def tune_threshold(model, loader, device, tta=True, limit=None):
    """Sweep the change threshold on val and return the SeK-best one.

    Run 1 sat at precision 0.79 / recall 0.53, i.e. 0.5 was too strict for the
    probabilities this head produces. One forward pass per batch feeds every
    threshold in the grid.
    """
    model.eval()
    grid = [round(float(t), 2) for t in np.arange(0.15, 0.76, 0.05)]
    ms = {t: SCDMetrics() for t in grid}
    for i, (im1, im2, y1, y2, _chg, _ids) in enumerate(loader):
        if limit and i >= limit:
            break
        im1, im2 = im1.to(device, non_blocking=True), im2.to(device, non_blocking=True)
        y1, y2 = y1.to(device, non_blocking=True), y2.to(device, non_blocking=True)
        with torch.autocast("cuda", dtype=torch.bfloat16, enabled=device == "cuda"):
            s1, s2, c = model.predict_probs(im1, im2, tta=tta)
        p1, p2 = s1.argmax(1) + 1, s2.argmax(1) + 1
        for t, m in ms.items():
            ch = c > t
            m.update(y1, p1 * ch)
            m.update(y2, p2 * ch)
    scores = {t: m.sek() for t, m in ms.items()}
    return max(scores, key=scores.get), scores


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--epochs", type=int, default=40)
    ap.add_argument("--batch-size", type=int, default=8)
    ap.add_argument("--lr", type=float, default=3e-4)
    ap.add_argument("--wd", type=float, default=1e-4)
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--seed", type=int, default=1337)
    ap.add_argument("--backbone", choices=BACKBONES, default="resnet18")
    ap.add_argument("--chg-weight", type=float, default=1.0)
    ap.add_argument("--pos-weight", type=float, default=None,
                    help="BCE pos_weight for the change head; default sqrt(unchanged/changed)")
    ap.add_argument("--dice-weight", type=float, default=1.0,
                    help="Dice loss on the change head, added to BCE; 0 disables")
    ap.add_argument("--sc-weight", type=float, default=1.0,
                    help="semantic consistency loss weight; 0 disables")
    ap.add_argument("--freeze-encoder", action="store_true")
    ap.add_argument("--eval-batches", type=int, default=0,
                    help="val batches per epoch; 0 = the whole val slice")
    ap.add_argument("--resume", default=None,
                    help="checkpoint to resume from, e.g. weights/last.pt")
    ap.add_argument("--smoke", action="store_true",
                    help="3 train iters, 2 eval batches, output to weights/smoke/")
    args = ap.parse_args()

    torch.manual_seed(args.seed)
    np.random.seed(args.seed)
    torch.backends.cudnn.benchmark = True
    device = "cuda" if torch.cuda.is_available() else "cpu"
    if device != "cuda":
        print("WARNING: no CUDA -- this will take days, not minutes.")
    out = WEIGHTS / "smoke" if args.smoke else WEIGHTS
    out.mkdir(parents=True, exist_ok=True)
    max_iters = 3 if args.smoke else None
    eval_limit = 2 if args.smoke else (args.eval_batches or None)
    print(f"device={device}  seed={args.seed}  epochs={args.epochs}  bs={args.batch_size}  "
          f"backbone={args.backbone}  dice={args.dice_weight}  sc={args.sc_weight}")

    train_ds = SecondDataset("fit", augment=True)
    val_ds = SecondDataset("val", augment=False)
    test_ds = SecondDataset("test", augment=False)
    print(f"fit {len(train_ds)} / val {len(val_ds)} (carved from train) / "
          f"test {len(test_ds)} (held out, final report only)")

    common = dict(num_workers=args.workers, pin_memory=(device == "cuda"),
                  persistent_workers=args.workers > 0)
    train_ld = DataLoader(train_ds, batch_size=args.batch_size, shuffle=True,
                          drop_last=True, **common)
    val_ld = DataLoader(val_ds, batch_size=args.batch_size, shuffle=False, **common)

    model = build_model(pretrained=True, device=device, backbone=args.backbone)
    if args.freeze_encoder:
        for p in model.encoder.parameters():
            p.requires_grad = False
        print("encoder frozen -- decoder + heads only")

    cls_w = compute_class_weights(device)
    ce = nn.CrossEntropyLoss(weight=cls_w, ignore_index=-1)
    if args.pos_weight is None:
        # Changed pixels are ~20% of the data; unweighted BCE left recall at 0.53 vs
        # precision 0.79. sqrt(neg/pos) pushes recall up without collapsing precision.
        counts = json.loads(CACHE.read_text())["counts"]
        args.pos_weight = math.sqrt(counts[0] / sum(counts[1:]))
    print(f"change-head pos_weight={args.pos_weight:.3f}")
    bce = nn.BCEWithLogitsLoss(pos_weight=torch.tensor(args.pos_weight, device=device))

    params = [p for p in model.parameters() if p.requires_grad]
    opt = torch.optim.AdamW(params, lr=args.lr, weight_decay=args.wd)
    steps_per_epoch = min(len(train_ld), max_iters or len(train_ld))
    total_steps = args.epochs * steps_per_epoch
    sched = make_scheduler(opt, total_steps)

    best_sek = -1.0
    history = []
    start_epoch = 1

    if args.resume:
        print(f"resuming from {args.resume}")
        ckpt = torch.load(args.resume, map_location=device, weights_only=False)
        model.load_state_dict(ckpt["model"])
        start_epoch = ckpt["epoch"] + 1
        if "optim" in ckpt:
            opt.load_state_dict(ckpt["optim"])
        if "sched" in ckpt:
            sched.load_state_dict(ckpt["sched"])
        else:
            # Older checkpoints didn't save scheduler state. Fast-forward the
            # cosine schedule so LR picks up where it left off instead of
            # restarting from the warmup.
            for _ in range((start_epoch - 1) * steps_per_epoch):
                sched.step()
        hist_path = out / "history.json"
        if hist_path.exists():
            history = json.loads(hist_path.read_text())
            history = [h for h in history if h["epoch"] < start_epoch]
            if history:
                best_sek = max(h["sek"] for h in history)
        print(f"resumed at epoch {start_epoch}, best_sek so far {best_sek:.4f}")

    t_start = time.time()

    for epoch in range(start_epoch, args.epochs + 1):
        model.train()
        running = ep_sem = ep_chg = ep_sc = 0.0
        t0 = time.time()
        for it, (im1, im2, y1, y2, chg, _ids) in enumerate(train_ld):
            if max_iters and it >= max_iters:
                break
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
            # Dice and consistency are computed in float32 (both cast internally).
            if args.dice_weight:
                l_chg = l_chg + args.dice_weight * dice_loss(chg_logit[:, 0], chg)
            l_sc = (consistency_loss(sem1, sem2, y1, y2) if args.sc_weight
                    else l_sem.new_zeros(()))
            loss = l_sem + args.chg_weight * l_chg + args.sc_weight * l_sc

            loss.backward()
            torch.nn.utils.clip_grad_norm_(params, 5.0)
            opt.step()
            sched.step()

            running += loss.item()
            ep_sem += l_sem.item()
            ep_chg += l_chg.item()
            ep_sc += l_sc.item()
            if it % 50 == 0:
                print(f"  ep{epoch:02d} [{it:4d}/{steps_per_epoch}] loss {loss.item():.4f} "
                      f"(sem {l_sem.item():.4f} chg {l_chg.item():.4f} sc {l_sc.item():.4f}) "
                      f"lr {sched.get_last_lr()[0]:.2e}", flush=True)

        n = steps_per_epoch
        m = evaluate(model, val_ld, device, limit=eval_limit)
        s = m.summary()
        dt = time.time() - t0
        print(f"epoch {epoch:02d}/{args.epochs}  loss {running/n:.4f} "
              f"(sem {ep_sem/n:.4f} chg {ep_chg/n:.4f} sc {ep_sc/n:.4f})  {dt:.0f}s")
        print(m.format(), flush=True)

        history.append({"epoch": epoch, "loss": running / n, **{
            k: v for k, v in s.items() if k != "per_class_iou"}})

        ckpt = {"model": model.state_dict(), "epoch": epoch, "args": vars(args),
                "metrics": s, "optim": opt.state_dict(), "sched": sched.state_dict()}
        torch.save(ckpt, out / "last.pt")
        if s["sek"] > best_sek:
            best_sek = s["sek"]
            torch.save(ckpt, out / "best.pt")
            print(f"  * new best val SeK {best_sek:.4f} -> {out / 'best.pt'}", flush=True)

        (out / "history.json").write_text(json.dumps(history, indent=2))

    print(f"\ndone in {(time.time()-t_start)/60:.1f} min. best val SeK {best_sek:.4f}")

    best = torch.load(out / "best.pt", map_location=device, weights_only=False)
    model.load_state_dict(best["model"])
    print(f"tuning change threshold with flip TTA on val (best.pt, epoch {best['epoch']})...")
    thresh, scores = tune_threshold(model, val_ld, device, tta=True, limit=eval_limit)
    print("  val SeK by threshold: " + "  ".join(f"{t:.2f}={v:.4f}" for t, v in scores.items()))
    print(f"  -> thresh {thresh:.2f}")
    best["thresh"], best["tta"] = thresh, True
    torch.save(best, out / "best.pt")

    print("final evaluation on the complete held-out test split...")
    test_ld = DataLoader(test_ds, batch_size=args.batch_size, shuffle=False, **common)
    plain = evaluate(model, test_ld, device, limit=eval_limit)
    print("  thresh 0.50, no TTA:")
    print(plain.format())
    tuned = evaluate(model, test_ld, device, limit=eval_limit, thresh=thresh, tta=True)
    print(f"  thresh {thresh:.2f}, flip TTA  (what analyze.py / the API use):")
    print(tuned.format())
    (out / "final_metrics.json").write_text(json.dumps({
        "epoch": best["epoch"], "thresh": thresh, "val_sek_by_thresh": scores,
        "plain": plain.summary(), "tuned": tuned.summary()}, indent=2))


if __name__ == "__main__":
    main()
