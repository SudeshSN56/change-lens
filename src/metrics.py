"""Evaluation metrics for semantic change detection.

Three numbers go on the slide:
  * binary change mIoU  -- did we find the right regions at all
  * SeK                 -- the SCD-standard score; ~20% is competitive on SECOND
  * per-class IoU       -- which of the six categories are weak, and why

SeK (Separated Kappa, Yang et al., the SECOND benchmark paper) deliberately
discounts the huge no-change class: the (0,0) cell of the confusion matrix is
zeroed before the kappa is computed, so a model that only ever says "nothing
changed" scores 0 rather than ~0.79.
"""

import numpy as np
import torch

from classes import N_SEM, NAMES


class SCDMetrics:
    """Accumulates a 7x7 confusion matrix over (true, pred) class-index pairs."""

    def __init__(self, n=N_SEM + 1):
        self.n = n
        self.reset()

    def reset(self):
        self.cm = np.zeros((self.n, self.n), dtype=np.int64)
        self.bin_cm = np.zeros((2, 2), dtype=np.int64)

    @torch.no_grad()
    def update(self, true_map, pred_map):
        """true_map, pred_map: integer tensors/arrays in 0..6 (0 = no-change)."""
        t = _to_numpy(true_map).ravel()
        p = _to_numpy(pred_map).ravel()
        k = t * self.n + p
        self.cm += np.bincount(k, minlength=self.n * self.n).reshape(self.n, self.n)

        tb = (t != 0).astype(np.int64)
        pb = (p != 0).astype(np.int64)
        self.bin_cm += np.bincount(tb * 2 + pb, minlength=4).reshape(2, 2)

    # --- binary change ------------------------------------------------------
    def binary_iou(self):
        """IoU of the changed class, and mIoU over {unchanged, changed}."""
        ious = []
        for c in (0, 1):
            tp = self.bin_cm[c, c]
            fp = self.bin_cm[:, c].sum() - tp
            fn = self.bin_cm[c, :].sum() - tp
            denom = tp + fp + fn
            ious.append(float(tp / denom) if denom else float("nan"))
        return ious[1], float(np.nanmean(ious))

    def binary_f1(self):
        tp = self.bin_cm[1, 1]
        fp = self.bin_cm[0, 1]
        fn = self.bin_cm[1, 0]
        prec = tp / (tp + fp) if tp + fp else 0.0
        rec = tp / (tp + fn) if tp + fn else 0.0
        f1 = 2 * prec * rec / (prec + rec) if prec + rec else 0.0
        return float(prec), float(rec), float(f1)

    # --- semantic -----------------------------------------------------------
    def per_class_iou(self):
        """IoU for the six land-cover classes, computed over changed pixels only.

        Rows/cols 0 are dropped: no-change is the binary head's job, and leaving
        it in would let a 79%-prior class dominate the average.
        """
        cm = self.cm[1:, 1:]
        out = {}
        for i in range(N_SEM):
            tp = cm[i, i]
            denom = cm[i, :].sum() + cm[:, i].sum() - tp
            out[NAMES[i + 1]] = float(tp / denom) if denom else float("nan")
        return out

    def miou(self):
        return float(np.nanmean(list(self.per_class_iou().values())))

    def sek(self):
        """Separated Kappa, as defined for the SECOND benchmark."""
        cm = self.cm.astype(np.float64).copy()
        cm[0, 0] = 0.0                      # discount the no-change agreement
        total = cm.sum()
        if total <= 0:
            return 0.0
        po = np.trace(cm) / total
        pe = (cm.sum(0) * cm.sum(1)).sum() / (total ** 2)
        kappa = (po - pe) / (1 - pe) if (1 - pe) > 1e-12 else 0.0
        # The benchmark weights the kappa by how hard the change mask itself was.
        iou_change, _ = self.binary_iou()
        if not np.isfinite(iou_change):
            iou_change = 0.0
        return float(np.exp(iou_change - 1) * kappa)

    def oa(self):
        """Overall accuracy over changed pixels only."""
        cm = self.cm[1:, 1:]
        return float(np.trace(cm) / cm.sum()) if cm.sum() else 0.0

    def summary(self):
        iou_c, bin_miou = self.binary_iou()
        prec, rec, f1 = self.binary_f1()
        return {
            "change_iou": iou_c,
            "binary_miou": bin_miou,
            "change_precision": prec,
            "change_recall": rec,
            "change_f1": f1,
            "sek": self.sek(),
            "sem_miou": self.miou(),
            "sem_oa": self.oa(),
            "per_class_iou": self.per_class_iou(),
        }

    def format(self):
        s = self.summary()
        lines = [
            f"  change IoU {s['change_iou']:.4f}  binary mIoU {s['binary_miou']:.4f}  "
            f"P {s['change_precision']:.3f} R {s['change_recall']:.3f} F1 {s['change_f1']:.3f}",
            f"  SeK {s['sek']:.4f}   semantic mIoU {s['sem_miou']:.4f}   OA {s['sem_oa']:.4f}",
            "  per-class IoU: " + "  ".join(
                f"{k}={v:.3f}" if np.isfinite(v) else f"{k}=n/a"
                for k, v in s["per_class_iou"].items()
            ),
        ]
        return "\n".join(lines)


def _to_numpy(x):
    if isinstance(x, torch.Tensor):
        return x.detach().cpu().numpy().astype(np.int64)
    return np.asarray(x, dtype=np.int64)
