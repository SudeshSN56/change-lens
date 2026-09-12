"""Turn a predicted (or ground-truth) label pair into the record the UI renders.

Run once over the held-out split to precompute everything the chatbot searches:

    python src/analyze.py                 # model predictions  -> index.json
    python src/analyze.py --source gt     # ground truth       -> index_gt.json

Both sources are built from the same code path, so the detail view can offer a
Model / Ground Truth toggle and the G2 risk switch costs nothing to exercise.
Ground-truth records are always tagged `"source": "ground_truth"` -- GT is never
passed off as model output.

Search runs entirely against the resulting JSON, so no inference happens at
query time.
"""

import argparse
import json
import time
from pathlib import Path

import numpy as np
import torch
from PIL import Image

from classes import NAMES, N_SEM
from metadata import make_metadata
from overlay import save_overlay

ROOT = Path(__file__).resolve().parents[1]
ANALYZED = ROOT / "data" / "analyzed"
OVERLAYS = ANALYZED / "overlays"
FRAME_PX = 512 * 512


# --- statistics -------------------------------------------------------------
def transition_matrix(y1, y2):
    """6x6 counts over changed pixels only. T[a][b] = was class a+1, became b+1.

    Diagonal entries are real and are kept: SECOND marks a region as changed when
    its appearance changed, which includes buildings that were rebuilt as
    buildings. That number is surfaced separately as `same_category_px`.
    """
    y1 = np.asarray(y1).ravel()
    y2 = np.asarray(y2).ravel()
    m = (y1 != 0) & (y2 != 0)
    T = np.zeros((N_SEM, N_SEM), dtype=np.int64)
    if m.any():
        np.add.at(T, (y1[m] - 1, y2[m] - 1), 1)
    return T


def per_category(T, changed_px):
    """Shares of the CHANGED REGION, not of the frame. The UI must always show
    `changed_px` beside this table or the numbers read as nonsense."""
    rows = []
    for i in range(N_SEM):
        before = float(T[i, :].sum())
        after = float(T[:, i].sum())
        pb = 100.0 * before / changed_px if changed_px else 0.0
        pa = 100.0 * after / changed_px if changed_px else 0.0
        delta = pa - pb
        # A relative percentage against a near-zero base is technically defined
        # but practically meaningless -- a before-share of 0.2% turns a modest
        # absolute gain into "+46,296.9%", which reads as a bug, not a metric.
        # Below MIN_BASE_PCT the base is treated the same as an exact zero.
        MIN_BASE_PCT = 1.0
        rel = round(delta / pb * 100.0, 1) if pb >= MIN_BASE_PCT else None
        rows.append({
            "class": NAMES[i + 1],
            "class_idx": i + 1,
            "px_before": int(before),
            "px_after": int(after),
            "pct_before": round(pb, 2),
            "pct_after": round(pa, 2),
            "delta_pp": round(delta, 2),
            "relative_pct": rel,
            "direction": "increase" if delta > 0.05 else
                         "decrease" if delta < -0.05 else "stable",
        })
    return rows


def top_transitions(T, k=5, include_diagonal=False):
    out = []
    for i in range(N_SEM):
        for j in range(N_SEM):
            if i == j and not include_diagonal:
                continue
            px = int(T[i, j])
            if px > 0:
                out.append({
                    "from": NAMES[i + 1], "to": NAMES[j + 1],
                    "from_idx": i + 1, "to_idx": j + 1,
                    "px": px,
                    "pct_of_frame": round(100.0 * px / FRAME_PX, 2),
                })
    out.sort(key=lambda d: -d["px"])
    return out[:k]


def describe(rec):
    """Pure f-string. No LLM, no VLM -- one less thing that needs a network."""
    md = rec["metadata"]
    parts = [
        f"Between {md['date_before']} and {md['date_after']} near {md['region']}, "
        f"{rec['changed_pct_of_frame']}% of the scene changed."
    ]
    if rec["changed_px"] == 0:
        return (f"No change was detected between {md['date_before']} and "
                f"{md['date_after']} near {md['region']}.")

    if rec["top_transitions"]:
        t = rec["top_transitions"][0]
        parts.append(f"The largest shift was {t['from']} to {t['to']} "
                     f"({t['pct_of_frame']}% of the frame).")

    gain = max(rec["per_category"], key=lambda r: r["delta_pp"])
    loss = min(rec["per_category"], key=lambda r: r["delta_pp"])
    if gain["delta_pp"] > 0.5 and loss["delta_pp"] < -0.5:
        parts.append(
            f"Within the changed area, {gain['class']} rose from "
            f"{gain['pct_before']}% to {gain['pct_after']}% while {loss['class']} "
            f"fell from {loss['pct_before']}% to {loss['pct_after']}%."
        )
    elif gain["delta_pp"] > 0.5:
        parts.append(f"Within the changed area, {gain['class']} rose from "
                     f"{gain['pct_before']}% to {gain['pct_after']}%.")

    same = rec["same_category_px"]
    if same > 0.15 * max(rec["changed_px"], 1):
        parts.append(f"{round(100.0*same/rec['changed_px'],1)}% of the changed area "
                     f"stayed in the same category but changed in appearance.")
    return " ".join(parts)


def build_record(pair_id, y1, y2, *, image1, image2, overlay, source, metadata=None):
    """The one function that defines a record. Used by precompute AND by the live
    upload endpoint, so the two can never disagree about what a record is."""
    T = transition_matrix(y1, y2)
    changed_px = int(T.sum())
    rec = {
        "pair_id": pair_id,
        "source": source,
        "image1": image1,
        "image2": image2,
        "overlay": overlay,
        "changed_px": changed_px,
        "changed_pct_of_frame": round(100.0 * changed_px / FRAME_PX, 2),
        "same_category_px": int(np.trace(T)),
        "transition_matrix": T.tolist(),
        "transition_vec": (T.astype(np.float64).ravel() / T.sum()).round(6).tolist()
                          if changed_px else [0.0] * (N_SEM * N_SEM),
        "per_category": per_category(T, changed_px),
        "top_transitions": top_transitions(T),
        "metadata": metadata or make_metadata(pair_id),
    }
    rec["description"] = describe(rec)
    return rec


# --- precompute -------------------------------------------------------------
def main():
    import sys
    sys.path.insert(0, str(Path(__file__).parent))
    from tqdm import tqdm
    from dataset import SecondDataset, load_pair, normalize, read_ids

    ap = argparse.ArgumentParser()
    ap.add_argument("--source", choices=["model", "gt"], default="model")
    ap.add_argument("--split", default="test")
    ap.add_argument("--checkpoint", default=str(ROOT / "weights" / "best.pt"))
    ap.add_argument("--batch-size", type=int, default=8)
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()

    OVERLAYS.mkdir(parents=True, exist_ok=True)
    ids = read_ids(args.split)
    if args.limit:
        ids = ids[:args.limit]
    print(f"analyzing {len(ids)} pairs from split '{args.split}' using {args.source}")

    model = None
    device = "cuda" if torch.cuda.is_available() else "cpu"
    if args.source == "model":
        from model import build_model
        ckpt = torch.load(args.checkpoint, map_location=device, weights_only=False)
        model = build_model(pretrained=False, device=device)
        model.load_state_dict(ckpt["model"])
        model.eval()
        print(f"loaded {args.checkpoint} (epoch {ckpt.get('epoch','?')}, "
              f"SeK {ckpt.get('metrics',{}).get('sek',float('nan')):.4f})")

    suffix = "" if args.source == "model" else "_gt"
    records = []
    t0 = time.time()

    for pid in tqdm(ids, unit="pair"):
        im1, im2, g1, g2 = load_pair(pid)
        if args.source == "gt":
            p1, p2 = g1, g2
        else:
            with torch.no_grad():
                a = torch.from_numpy(normalize(im1))[None].to(device)
                b = torch.from_numpy(normalize(im2))[None].to(device)
                with torch.autocast("cuda", dtype=torch.bfloat16, enabled=device == "cuda"):
                    o1, o2, _ = model.predict(a, b)
                p1 = o1[0].cpu().numpy().astype(np.uint8)
                p2 = o2[0].cpu().numpy().astype(np.uint8)

        ov_name = f"{pid}{suffix}.png"
        save_overlay(OVERLAYS / ov_name, im2, p2)

        rec = build_record(
            pid, p1, p2,
            image1=f"/media/second/im1/{pid}.png",
            image2=f"/media/second/im2/{pid}.png",
            overlay=f"/media/analyzed/overlays/{ov_name}",
            source="model" if args.source == "model" else "ground_truth",
        )
        (ANALYZED / f"{pid}{suffix}.json").write_text(json.dumps(rec, indent=2))
        # index.json drops the 6x6 matrix but keeps the 36-vec: that is what
        # similarity search needs, and it keeps the file small enough to hold in RAM.
        records.append({k: v for k, v in rec.items() if k != "transition_matrix"})

    out = ANALYZED / f"index{suffix}.json"
    out.write_text(json.dumps(records))
    mb = out.stat().st_size / 1e6
    print(f"\nwrote {out} -- {len(records)} records, {mb:.1f} MB, "
          f"{time.time()-t0:.0f}s")
    print(f"overlays in {OVERLAYS}")

    ch = np.array([r["changed_pct_of_frame"] for r in records])
    print(f"changed% of frame: mean {ch.mean():.1f} median {np.median(ch):.1f} "
          f"min {ch.min():.1f} max {ch.max():.1f}")


if __name__ == "__main__":
    main()
