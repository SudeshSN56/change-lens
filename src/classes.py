"""Single source of truth for SECOND's class definitions.

Imported by dataset.py, train.py, analyze.py, overlay.py, parser.py and api.py so
that class ordering can never drift between training and serving.

Index 0 is no-change. Indices 1..6 are the six land-cover categories that SECOND
labels *inside changed regions only*. The semantic heads of the model predict 6
classes (0..5, i.e. index-1), never 7 -- see model.py.
"""

import numpy as np

# --- canonical ordering -----------------------------------------------------
# (index, name, RGB). Verified against the shipped label PNGs: a 300-pair sample
# contained these seven colors and no others.
CLASSES = [
    (0, "no-change",            (255, 255, 255)),
    (1, "non-vegetated ground", (128, 128, 128)),
    (2, "tree",                 (0, 255, 0)),
    (3, "low vegetation",       (0, 128, 0)),
    (4, "water",                (0, 0, 255)),
    (5, "buildings",            (128, 0, 0)),
    (6, "playgrounds",          (255, 0, 0)),
]

NAMES = [name for _, name, _ in CLASSES]
COLORS = [rgb for _, _, rgb in CLASSES]
N_CLASSES = 7          # including no-change
N_SEM = 6              # what the semantic heads actually predict

# Short labels for tight UI surfaces (table rows, legends).
SHORT = {
    0: "no-change", 1: "ground", 2: "tree", 3: "low veg",
    4: "water", 5: "buildings", 6: "playground",
}


# --- RGB <-> index ----------------------------------------------------------
def _packed(rgb):
    r, g, b = rgb
    return (r << 16) | (g << 8) | b


# Lookup on the packed 24-bit integer rather than nested comparisons: one
# vectorised gather instead of seven equality tests per pixel.
_LUT = np.zeros(1 << 24, dtype=np.uint8)
_KNOWN = np.zeros(1 << 24, dtype=bool)
for _i, _n, _rgb in CLASSES:
    _LUT[_packed(_rgb)] = _i
    _KNOWN[_packed(_rgb)] = True


def rgb_to_index(arr, strict=True):
    """(H,W,3) uint8 RGB label map -> (H,W) uint8 class indices.

    Unknown colors map to 0 (no-change). With strict=True a ValueError names the
    offending colors: any stray color means the PNG was resaved with
    interpolation, and the fix is to reload it with a nearest-neighbour path
    rather than to silently absorb the damage.
    """
    a = np.asarray(arr, dtype=np.uint32)
    if a.ndim != 3 or a.shape[2] != 3:
        raise ValueError(f"expected (H,W,3) RGB, got {a.shape}")
    keys = (a[..., 0] << 16) | (a[..., 1] << 8) | a[..., 2]
    bad = ~_KNOWN[keys]
    if bad.any():
        n = int(bad.sum())
        if strict:
            uniq = np.unique(a.reshape(-1, 3)[bad.ravel()], axis=0)[:8]
            raise ValueError(
                f"{n} pixels with colors outside the SECOND palette, e.g. "
                f"{[tuple(int(v) for v in c) for c in uniq]}. The label PNG has "
                f"been resampled; reload it with nearest-neighbour only."
            )
        print(f"[classes] WARNING: {n} unknown-color pixels mapped to no-change")
    return _LUT[keys]


def index_to_rgb(idx):
    """(H,W) class indices -> (H,W,3) uint8 RGB, for overlays and debug dumps."""
    out = np.zeros(idx.shape + (3,), dtype=np.uint8)
    for i, _n, rgb in CLASSES:
        out[idx == i] = rgb
    return out


# --- query vocabulary (consumed by parser.py) -------------------------------
# Aliases are matched longest-first so "bare ground" wins over "ground".
ALIASES = {
    1: ["non-vegetated ground", "bare ground", "cleared land", "barren land",
        "bare soil", "non-vegetated", "barren", "cleared", "bare", "soil",
        "ground"],
    2: ["tree cover", "trees", "forest", "canopy", "woodland", "tree"],
    3: ["low vegetation", "farmland", "cropland", "grassland", "shrubs",
        "shrub", "crops", "grass", "low veg"],
    4: ["water body", "waterbody", "lake", "river", "pond", "water"],
    5: ["built-up area", "built up", "built-up", "construction", "buildings",
        "building", "houses", "urban", "structures"],
    # "ground" alone is deliberately NOT here: it collides with class 1 and the
    # parser resolves the bare word to class 1.
    6: ["sports field", "playgrounds", "playground", "sports ground"],
}

# Multi-class group aliases.
GROUPS = {
    "vegetation": [2, 3],
    "greenery":   [2, 3],
    "green cover": [2, 3],
    "green space": [2, 3],
    "land":       [1, 2, 3],
}

# Named transition aliases -> (from_set, to_set).
TRANSITION_ALIASES = {
    "deforestation":   ([2], [1, 5]),
    "urbanization":    ([1, 2, 3], [5]),
    "urbanisation":    ([1, 2, 3], [5]),
    "urban expansion": ([1, 2, 3], [5]),
    "urban sprawl":    ([1, 2, 3], [5]),
    "construction":    ([1, 2, 3], [5]),
    "reforestation":   ([1, 5], [2]),
    "afforestation":   ([1, 5], [2]),
    "greening":        ([1, 5], [2, 3]),
    "land clearing":   ([2, 3], [1]),
    "land clearance":  ([2, 3], [1]),
    "flooding":        ([1, 2, 3, 5], [4]),
}

INCREASE_WORDS = ["increase", "increased", "increases", "increasing", "rise",
                  "rose", "risen", "rising", "grew", "grow", "grown", "growth",
                  "gain", "gained", "gains", "more", "expansion", "expanded",
                  "expand", "added", "appeared", "new"]

DECREASE_WORDS = ["decrease", "decreased", "decreases", "decreasing", "loss",
                  "lost", "lose", "fell", "fall", "fallen", "reduced", "reduce",
                  "reduction", "decline", "declined", "cleared", "clearing",
                  "removed", "removal", "less", "shrank", "shrunk", "shrink",
                  "disappeared", "destroyed", "vanished"]
