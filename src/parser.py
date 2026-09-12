"""Rule-based natural-language query parser. Regex and keywords only, no ML.

Being rule-based is the point, not a compromise: the parsed filter is echoed back
to the user, so every result is explainable and a judge can see exactly why they
got what they got.

Supported patterns (build these ten, then stop):
     1  "vegetation decreased"                 categories=[2,3] direction=decrease
     2  "where buildings increased"            categories=[5]   direction=increase
     3  "tree loss over 10%"                   + threshold=10
     4  "trees became buildings"               transition=([2],[5])
     5  "vegetation converted to bare ground"  transition=([2,3],[1])
     6  "changes in Chengdu"                   region=Chengdu
     7  "within 20 km of 30.28, 120.15"        centre + radius
     8  "between 2015 and 2018"                date range
     9  "most changed areas"                   sort=changed_pct
    10  "deforestation" / "urbanization"       alias -> transition
"""

import re
from dataclasses import dataclass, field, asdict
from typing import List, Optional, Tuple

from classes import (ALIASES, DECREASE_WORDS, GROUPS, INCREASE_WORDS, NAMES,
                     TRANSITION_ALIASES)
from metadata import CITIES

REGIONS = [c[0] for c in CITIES]

# Longest alias first so "bare ground" beats "ground" and "low vegetation" beats
# "vegetation".
_ALIAS_TERMS: List[Tuple[str, List[int]]] = []
for _idx, _words in ALIASES.items():
    for _w in _words:
        _ALIAS_TERMS.append((_w, [_idx]))
for _name, _idxs in GROUPS.items():
    _ALIAS_TERMS.append((_name, list(_idxs)))
_ALIAS_TERMS.sort(key=lambda t: -len(t[0]))

_TRANSITION_VERBS = (r"became|becomes|become|turned\s+into|turning\s+into|"
                     r"converted\s+(?:in)?to|converting\s+(?:in)?to|conversion\s+to|"
                     r"replaced\s+by|replaced\s+with|changed\s+(?:in)?to|"
                     r"turned\s+to|gave\s+way\s+to|->|→")


@dataclass
class Filter:
    text: str = ""
    categories: List[int] = field(default_factory=list)
    direction: Optional[str] = None            # "increase" | "decrease"
    threshold: Optional[float] = None
    threshold_kind: str = "pp"                 # "pp" | "relative"
    transition: Optional[Tuple[List[int], List[int]]] = None
    region: Optional[str] = None
    center: Optional[Tuple[float, float]] = None
    radius_km: Optional[float] = None
    date_before_range: Optional[Tuple[str, str]] = None
    date_after_range: Optional[Tuple[str, str]] = None
    sort: str = "relevance"                    # "relevance" | "changed_pct"
    limit: int = 10
    matched_alias: Optional[str] = None

    def to_dict(self):
        return asdict(self)

    def is_empty(self):
        return not any([self.categories, self.direction, self.transition,
                        self.region, self.center, self.date_before_range,
                        self.date_after_range, self.threshold])

    def describe(self):
        """Human-readable echo. This string is rendered in the UI verbatim."""
        bits = []
        if self.transition:
            f = ", ".join(NAMES[i] for i in self.transition[0])
            t = ", ".join(NAMES[i] for i in self.transition[1])
            bits.append(f"transition {f} → {t}")
        if self.categories and not self.transition:
            bits.append("category " + ", ".join(NAMES[i] for i in self.categories))
        if self.direction:
            bits.append(f"direction {self.direction}")
        if self.threshold is not None:
            unit = "pp of changed area" if self.threshold_kind == "pp" else "% relative"
            bits.append(f"threshold ≥ {self.threshold:g} {unit}")
        if self.region:
            bits.append(f"region {self.region}")
        if self.center:
            bits.append(f"within {self.radius_km:g} km of "
                        f"{self.center[0]:.4f}, {self.center[1]:.4f}")
        if self.date_before_range:
            bits.append(f"before-image {self.date_before_range[0][:4]}"
                        f"–{self.date_before_range[1][:4]}")
        if self.date_after_range:
            bits.append(f"after-image {self.date_after_range[0][:4]}"
                        f"–{self.date_after_range[1][:4]}")
        if self.sort == "changed_pct":
            bits.append("sorted by total change")
        if self.matched_alias:
            bits.append(f"alias “{self.matched_alias}”")
        return "; ".join(bits) if bits else "no constraints — showing most changed areas"


def _find_categories(text):
    """Longest-first, non-overlapping alias scan. Returns (indices, spans)."""
    found, spans = [], []
    for term, idxs in _ALIAS_TERMS:
        for m in re.finditer(r"\b" + re.escape(term) + r"s?\b", text):
            if any(s <= m.start() < e or s < m.end() <= e for s, e in spans):
                continue
            spans.append((m.start(), m.end()))
            found.append((m.start(), idxs))
    found.sort()
    return found, spans


def parse(text, limit=10):
    """Raw query text -> Filter."""
    q = " " + (text or "").lower().strip() + " "
    f = Filter(text=text or "", limit=limit)

    # --- 10. named transition aliases (deforestation, urbanization, ...) ------
    for alias, (src, dst) in sorted(TRANSITION_ALIASES.items(), key=lambda kv: -len(kv[0])):
        if re.search(r"\b" + re.escape(alias) + r"\b", q):
            f.transition = (list(src), list(dst))
            f.matched_alias = alias
            break

    # --- 6. region -----------------------------------------------------------
    for r in REGIONS:
        if re.search(r"\b" + r.lower() + r"\b", q):
            f.region = r
            break

    # --- 7. geographic centre + radius --------------------------------------
    coord = re.search(r"(-?\d{1,3}\.\d+)\s*[,°NnSs]*\s*[, ]\s*(-?\d{1,3}\.\d+)", q)
    if coord:
        f.center = (float(coord.group(1)), float(coord.group(2)))
        rad = re.search(r"(\d+(?:\.\d+)?)\s*(?:km|kilometers?|kilometres?)", q)
        f.radius_km = float(rad.group(1)) if rad else 25.0

    # --- 8. date ranges ------------------------------------------------------
    rng = re.search(r"between\s+(\d{4})\s+and\s+(\d{4})", q) or \
          re.search(r"(\d{4})\s*(?:-|–|to)\s*(\d{4})", q)
    if rng:
        y0, y1 = sorted((int(rng.group(1)), int(rng.group(2))))
        f.date_before_range = (f"{y0}-01-01", f"{y1}-12-31")
    else:
        one = re.search(r"\b(?:after|since)\s+(\d{4})", q)
        if one:
            f.date_after_range = (f"{int(one.group(1))}-01-01", "2099-12-31")
        else:
            one = re.search(r"\bbefore\s+(\d{4})", q)
            if one:
                f.date_before_range = ("1900-01-01", f"{int(one.group(1))}-12-31")

    # --- 3. numeric threshold ------------------------------------------------
    num = re.search(r"(?:over|above|more\s+than|at\s+least|greater\s+than|>)\s*"
                    r"(\d+(?:\.\d+)?)\s*%", q) or re.search(r"(\d+(?:\.\d+)?)\s*%", q)
    if num:
        f.threshold = float(num.group(1))
        f.threshold_kind = "relative" if "relative" in q else "pp"

    # --- 1/2/4/5. categories, direction, explicit transitions ----------------
    cats, _ = _find_categories(q)

    if f.transition is None:
        verb = re.search(_TRANSITION_VERBS, q)
        if verb and len(cats) >= 2:
            src = [c for pos, c in cats if pos < verb.start()]
            dst = [c for pos, c in cats if pos >= verb.end()]
            if src and dst:
                f.transition = (sorted({i for g in src for i in g}),
                                sorted({i for g in dst for i in g}))
        # Bare "X to Y" with exactly two categories and no other verb.
        if f.transition is None and len(cats) == 2:
            between = q[cats[0][0]:cats[1][0]]
            if re.search(r"\bto\b|\binto\b", between):
                f.transition = (sorted(cats[0][1]), sorted(cats[1][1]))

    if f.transition is None and cats:
        f.categories = sorted({i for _, idxs in cats for i in idxs})

    # --- direction -----------------------------------------------------------
    if any(re.search(r"\b" + w + r"\b", q) for w in DECREASE_WORDS):
        f.direction = "decrease"
    elif any(re.search(r"\b" + w + r"\b", q) for w in INCREASE_WORDS):
        f.direction = "increase"

    # --- 9. explicit sort ----------------------------------------------------
    if re.search(r"most\s+changed|biggest\s+change|largest\s+change|"
                 r"top\s+chang|highest\s+change|most\s+affected", q):
        f.sort = "changed_pct"
        f.direction = f.direction if f.categories or f.transition else None
    if f.is_empty():
        f.sort = "changed_pct"

    if re.search(r"\bunchanged\b|\bno\s+change\b|\bstable\b", q):
        f.sort = "changed_pct_asc"

    n = re.search(r"\b(?:top|first|show\s+me)\s+(\d{1,3})\b", q)
    if n:
        f.limit = max(1, min(100, int(n.group(1))))

    return f


if __name__ == "__main__":
    import sys
    # describe() emits → and ≥ for the browser; the Windows console is cp1252.
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    tests = [
        "vegetation decreased", "where buildings increased", "tree loss over 10%",
        "trees became buildings", "vegetation converted to bare ground",
        "changes in Chengdu", "within 20 km of 30.28, 120.15",
        "between 2015 and 2018", "most changed areas", "deforestation",
        "urbanization in Shanghai", "where did water increase",
        "show me 5 areas where farmland turned into buildings",
    ]
    for t in tests:
        print(f"{t!r}\n    -> {parse(t).describe()}")
