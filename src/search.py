"""Filtering, ranking and similarity over the precomputed index.

No inference happens here. Everything is a pass over ~742 in-memory dicts, which
is why query results appear instantly.

The fallback ladder is the important part: a filter that matches nothing is
relaxed one constraint at a time rather than returning an empty list. An empty
screen reads as broken software; "no exact match, here is the closest" reads as a
considered product.
"""

import math
from copy import deepcopy

import numpy as np

EARTH_R_KM = 6371.0


# --- geometry ---------------------------------------------------------------
def haversine_km(lat1, lon1, lat2, lon2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_R_KM * math.asin(math.sqrt(a))


# --- per-record predicates --------------------------------------------------
def _cat_row(rec, idx):
    for r in rec["per_category"]:
        if r["class_idx"] == idx:
            return r
    return None


def _category_delta(rec, categories):
    """Net change in percentage points, summed over the requested categories."""
    return sum((_cat_row(rec, i) or {}).get("delta_pp", 0.0) for i in categories)


def _transition_px(rec, src, dst):
    """Pixels moving from any class in src to any class in dst."""
    total = 0
    for t in rec.get("top_transitions", []):
        if t["from_idx"] in src and t["to_idx"] in dst:
            total += t["px"]
    # top_transitions is truncated to 5, so fall back to the full matrix when the
    # record carries one (single-record reads do; the index does not).
    tm = rec.get("transition_matrix")
    if tm:
        total = sum(tm[i - 1][j - 1] for i in src for j in dst if i != j)
    return total


def matches(rec, f):
    """Does this record satisfy every constraint in the filter?"""
    md = rec.get("metadata", {})

    if f.region and md.get("region") != f.region:
        return False

    if f.center:
        d = haversine_km(f.center[0], f.center[1], md.get("lat", 0), md.get("lon", 0))
        if d > (f.radius_km or 25.0):
            return False

    if f.date_before_range:
        lo, hi = f.date_before_range
        if not (lo <= md.get("date_before", "") <= hi):
            return False

    if f.date_after_range:
        lo, hi = f.date_after_range
        if not (lo <= md.get("date_after", "") <= hi):
            return False

    if f.transition:
        src, dst = f.transition
        px = _transition_px(rec, src, dst)
        if px <= 0:
            return False
        if f.threshold is not None:
            pct_frame = 100.0 * px / (512 * 512)
            if pct_frame < f.threshold:
                return False
        return True

    if f.categories:
        delta = _category_delta(rec, f.categories)
        if f.direction == "increase" and delta <= 0:
            return False
        if f.direction == "decrease" and delta >= 0:
            return False
        if f.direction is None and abs(delta) <= 0:
            return False
        if f.threshold is not None:
            if f.threshold_kind == "pp":
                if abs(delta) < f.threshold:
                    return False
            else:
                rows = [_cat_row(rec, i) for i in f.categories]
                rels = [abs(r["relative_pct"]) for r in rows
                        if r and r["relative_pct"] is not None]
                if not rels or max(rels) < f.threshold:
                    return False
        return True

    return True


def relevance(rec, f):
    """Rank by the magnitude of the thing that was actually asked for."""
    if f.transition:
        src, dst = f.transition
        return _transition_px(rec, src, dst)
    if f.categories:
        return abs(_category_delta(rec, f.categories))
    return rec.get("changed_pct_of_frame", 0.0)


# --- the ladder -------------------------------------------------------------
def _relaxations(f):
    """Yield (filter, note) progressively weaker than f, in the order of §7."""
    steps = []

    if f.threshold is not None:
        g = deepcopy(f); g.threshold = None
        steps.append((g, "No match at that threshold — dropped the size cut-off."))

    g = deepcopy(f); g.threshold = None
    if f.date_before_range or f.date_after_range:
        g.date_before_range = g.date_after_range = None
        steps.append((g, "No match in that date range — searched every date."))

    g = deepcopy(g)
    if f.region or f.center:
        g.region = None; g.center = None; g.radius_km = None
        steps.append((g, "No match in that area — searched every region."))

    if f.transition:
        g = deepcopy(g)
        src, dst = f.transition
        g.transition = None
        g.categories = sorted(set(src) | set(dst))
        g.direction = None
        steps.append((g, "No match for that exact transition — showing any change "
                         "involving those categories."))

    if f.direction:
        g = deepcopy(g); g.direction = None
        steps.append((g, "No match in that direction — showing change either way."))

    return steps


def run_query(records, f):
    """-> (results, relaxed, note). Never returns an empty list when records exist."""
    hits = [r for r in records if matches(r, f)]
    if hits:
        return _sort(hits, f)[:f.limit], False, None

    for g, note in _relaxations(f):
        hits = [r for r in records if matches(r, g)]
        if hits:
            return _sort(hits, g)[:f.limit], True, note

    top = sorted(records, key=lambda r: -r.get("changed_pct_of_frame", 0))
    return (top[:f.limit], True,
            "No exact matches — showing the most changed areas in the index.")


def _sort(hits, f):
    if f.sort == "changed_pct":
        return sorted(hits, key=lambda r: -r.get("changed_pct_of_frame", 0))
    if f.sort == "changed_pct_asc":
        return sorted(hits, key=lambda r: r.get("changed_pct_of_frame", 0))
    return sorted(hits, key=lambda r: -relevance(r, f))


# --- similarity -------------------------------------------------------------
class SimilarityIndex:
    """Cosine similarity over the 36-dim L1-normalised transition vectors."""

    def __init__(self, records):
        self.records = records
        m = np.array([r["transition_vec"] for r in records], dtype=np.float32)
        norms = np.linalg.norm(m, axis=1, keepdims=True)
        self.mat = m / np.maximum(norms, 1e-8)

    def query(self, vec, k=5, exclude=None):
        v = np.asarray(vec, dtype=np.float32)
        v = v / max(float(np.linalg.norm(v)), 1e-8)
        sims = self.mat @ v
        order = np.argsort(-sims)
        out = []
        for i in order:
            rec = self.records[int(i)]
            if exclude and rec["pair_id"] == exclude:
                continue
            out.append({**rec, "similarity": round(float(sims[int(i)]), 4)})
            if len(out) >= k:
                break
        return out
