"""Render one flat 512x512 PNG per pair showing what changed and what it became.

Deliberately a single baked image rather than client-side compositing: the
browser only has to <img src> it, which is one fewer thing that can break on
stage.

    1. im2, desaturated to greyscale and dimmed to 60% -- the unchanged context
    2. the after-class colour blended at alpha 0.55 inside changed regions
    3. a 1px white boundary around each connected change region
    4. a small legend, bottom-left, listing only the classes actually present
"""

import cv2
import numpy as np
from PIL import Image

from classes import COLORS, SHORT

ALPHA = 0.55
DIM = 0.60
LEGEND_SWATCH = 11
LEGEND_ROW = 15
LEGEND_PAD = 6


def make_overlay(im2, pred2, change=None):
    """im2 (H,W,3) uint8, pred2 (H,W) ints 0..6 -> (H,W,3) uint8 overlay."""
    im2 = np.asarray(im2, dtype=np.uint8)
    pred2 = np.asarray(pred2)
    if change is None:
        change = pred2 != 0
    change = np.asarray(change).astype(bool)

    grey = cv2.cvtColor(im2, cv2.COLOR_RGB2GRAY)
    base = (np.repeat(grey[:, :, None], 3, axis=2).astype(np.float32) * DIM)

    colour = np.zeros_like(base)
    present = []
    for idx in range(1, len(COLORS)):
        m = (pred2 == idx) & change
        if m.any():
            colour[m] = COLORS[idx]
            present.append((idx, int(m.sum())))

    out = base.copy()
    out[change] = (1 - ALPHA) * base[change] + ALPHA * colour[change]
    out = np.clip(out, 0, 255).astype(np.uint8)

    # 1px white boundary: dilate the mask and keep the rind.
    if change.any():
        m8 = change.astype(np.uint8)
        edge = cv2.dilate(m8, np.ones((3, 3), np.uint8), iterations=1) - m8
        out[edge.astype(bool)] = (255, 255, 255)

    present.sort(key=lambda t: -t[1])
    return _draw_legend(out, [i for i, _ in present])


def _draw_legend(img, indices):
    if not indices:
        return img
    h, w = img.shape[:2]
    box_h = LEGEND_ROW * len(indices) + LEGEND_PAD * 2
    box_w = 122
    x0, y0 = LEGEND_PAD, h - box_h - LEGEND_PAD

    panel = img[y0:y0 + box_h, x0:x0 + box_w].astype(np.float32)
    img[y0:y0 + box_h, x0:x0 + box_w] = (panel * 0.25).astype(np.uint8)

    for r, idx in enumerate(indices):
        sy = y0 + LEGEND_PAD + r * LEGEND_ROW
        sx = x0 + LEGEND_PAD
        img[sy:sy + LEGEND_SWATCH, sx:sx + LEGEND_SWATCH] = COLORS[idx]
        cv2.rectangle(img, (sx, sy), (sx + LEGEND_SWATCH, sy + LEGEND_SWATCH),
                      (255, 255, 255), 1)
        cv2.putText(img, SHORT[idx], (sx + LEGEND_SWATCH + 5, sy + LEGEND_SWATCH - 1),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.33, (255, 255, 255), 1, cv2.LINE_AA)
    return img


def save_overlay(path, im2, pred2, change=None):
    Image.fromarray(make_overlay(im2, pred2, change)).save(path, optimize=True)
