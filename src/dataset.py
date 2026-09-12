"""SECOND dataset: paired images plus paired semantic labels.

An item is (im1, im2, y1, y2, change_mask):
    im1, im2      3x512x512 float, ImageNet-normalised
    y1, y2        512x512 long in 0..6 (0 = no-change / unlabelled)
    change_mask   512x512 float, 1 where the pair changed

SECOND only labels land cover inside changed regions, so y1 != 0 and y2 != 0 are
the same mask. That was verified on a 315-pair sample (zero mismatches) and is
re-checked on the fly for the first few items via ASSERT_MASK_EQ.
"""

import random
from pathlib import Path

import numpy as np
import torch
from PIL import Image
from torch.utils.data import Dataset

from classes import rgb_to_index

IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
IMAGENET_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)

ROOT = Path(__file__).resolve().parents[1]
SECOND = ROOT / "data" / "second"
SPLITS = ROOT / "data" / "splits"

# The mask-equality invariant is cheap but not free; check the first N items of
# each worker rather than every batch for all 40 epochs.
ASSERT_MASK_EQ = 32


# "fit" and "val" are carved from train.txt on the fly (every 10th id is val), so the
# on-disk split is never regenerated and test.txt stays the untouched eval set.
# Checkpoint selection and threshold tuning happen on val, never on test.
VAL_EVERY = 10


def read_ids(split):
    if split in ("fit", "val"):
        ids = read_ids("train")
        if split == "val":
            return ids[::VAL_EVERY]
        return [x for i, x in enumerate(ids) if i % VAL_EVERY]
    p = SPLITS / f"{split}.txt"
    if not p.exists():
        raise FileNotFoundError(f"{p} missing -- run `python src/make_split.py` first")
    return [ln.strip() for ln in p.read_text().splitlines() if ln.strip()]


def load_pair(pair_id, root=SECOND):
    """Read the four PNGs for one pair as numpy arrays. No resizing anywhere:
    512x512 is the native tile size, so nothing ever touches an interpolator."""
    im1 = np.array(Image.open(root / "im1" / f"{pair_id}.png").convert("RGB"))
    im2 = np.array(Image.open(root / "im2" / f"{pair_id}.png").convert("RGB"))
    l1 = np.array(Image.open(root / "label1" / f"{pair_id}.png").convert("RGB"))
    l2 = np.array(Image.open(root / "label2" / f"{pair_id}.png").convert("RGB"))
    return im1, im2, rgb_to_index(l1), rgb_to_index(l2)


def normalize(img):
    """(H,W,3) uint8 -> (3,H,W) float32, ImageNet-normalised."""
    x = img.astype(np.float32) / 255.0
    x = (x - IMAGENET_MEAN) / IMAGENET_STD
    return np.ascontiguousarray(x.transpose(2, 0, 1))


def _jitter(img, rng, amount=0.2):
    """Independent brightness/contrast wobble, to mimic two different sensors."""
    x = img.astype(np.float32)
    x = x * (1.0 + rng.uniform(-amount, amount))              # brightness
    m = x.mean()
    x = (x - m) * (1.0 + rng.uniform(-amount, amount)) + m    # contrast
    return np.clip(x, 0, 255).astype(np.uint8)


class SecondDataset(Dataset):
    def __init__(self, split, augment=False, root=SECOND):
        self.ids = read_ids(split)
        self.augment = augment
        self.root = Path(root)
        self._checked = 0

    def __len__(self):
        return len(self.ids)

    def __getitem__(self, i):
        pair_id = self.ids[i]
        im1, im2, y1, y2 = load_pair(pair_id, self.root)

        if self._checked < ASSERT_MASK_EQ:
            self._checked += 1
            if not np.array_equal(y1 != 0, y2 != 0):
                raise AssertionError(
                    f"pair {pair_id}: label1 and label2 disagree on which pixels "
                    f"changed ({int((y1 != 0).sum())} vs {int((y2 != 0).sum())}). "
                    f"The change mask is no longer derivable from y1 alone."
                )

        if self.augment:
            rng = random.Random()

            # Temporal swap first: free 2x data, and teaches the change head that
            # change is symmetric while the semantic heads stay tied to their own
            # timestep.
            if rng.random() < 0.5:
                im1, im2, y1, y2 = im2, im1, y2, y1

            # Geometry -- identical transform applied to all four arrays, so the
            # label maps are only ever indexed/flipped, never resampled.
            if rng.random() < 0.5:
                im1, im2, y1, y2 = (np.fliplr(a) for a in (im1, im2, y1, y2))
            if rng.random() < 0.5:
                im1, im2, y1, y2 = (np.flipud(a) for a in (im1, im2, y1, y2))
            k = rng.randint(0, 3)
            if k:
                im1, im2, y1, y2 = (np.rot90(a, k) for a in (im1, im2, y1, y2))

            # Photometric -- independently per image, never to the labels.
            im1, im2 = _jitter(im1, rng), _jitter(im2, rng)

        y1 = np.ascontiguousarray(y1).astype(np.int64)
        y2 = np.ascontiguousarray(y2).astype(np.int64)
        change = (y1 != 0).astype(np.float32)

        return (
            torch.from_numpy(normalize(np.ascontiguousarray(im1))),
            torch.from_numpy(normalize(np.ascontiguousarray(im2))),
            torch.from_numpy(y1),
            torch.from_numpy(y2),
            torch.from_numpy(change),
            pair_id,
        )
