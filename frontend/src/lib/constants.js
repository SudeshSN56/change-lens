// Dev server talks to the API on :8000; a production build is served by the API itself, so same-origin.
export const API = import.meta.env.VITE_API ?? (import.meta.env.DEV ? "http://localhost:8000" : "");

export const media = (p) => (!p ? "" : /^(https?:|blob:|data:)/.test(p) ? p : API + p);

// SECOND's label palette, mirrored from src/classes.py, so every swatch matches the
// baked overlay PNGs exactly.
export const CLASSES = [
  { idx: 1, name: "non-vegetated ground", short: "Ground", color: "#808080" },
  { idx: 2, name: "tree", short: "Tree", color: "#00ff00" },
  { idx: 3, name: "low vegetation", short: "Low veg", color: "#008000" },
  { idx: 4, name: "water", short: "Water", color: "#0000ff" },
  { idx: 5, name: "buildings", short: "Buildings", color: "#800000" },
  { idx: 6, name: "playgrounds", short: "Playground", color: "#ff0000" },
];
export const CLASS_BY_IDX = Object.fromEntries(CLASSES.map((c) => [c.idx, c]));
export const CLASS_BY_NAME = Object.fromEntries(CLASSES.map((c) => [c.name, c]));

// Capture-city bounding boxes, mirrored from src/metadata.py (positions inside are synthetic).
export const CITIES = [
  { name: "Hangzhou", lat: [30.15, 30.4], lon: [120.05, 120.3] },
  { name: "Chengdu", lat: [30.55, 30.75], lon: [103.95, 104.2] },
  { name: "Shanghai", lat: [31.1, 31.35], lon: [121.35, 121.6] },
];

export const FRAME_PX = 512 * 512;

// Change level from the share of the frame that changed. On the held-out index these
// cut-offs put ~5% of tiles at Severe and ~18% at High or above.
export const LEVELS = [
  { key: "severe", label: "Severe", min: 40, color: "#d03b3b", icon: "▲" },
  { key: "high", label: "High", min: 25, color: "#ec835a", icon: "◆" },
  { key: "moderate", label: "Moderate", min: 10, color: "#fab219", icon: "■" },
  { key: "low", label: "Low", min: 0, color: "#7d8a99", icon: "●" },
];
export const levelOf = (pct) => LEVELS.find((l) => (pct ?? 0) >= l.min) ?? LEVELS[3];

// Transitions grouped into activity types (1-based class indices). First match wins,
// so the groups partition all 30 off-diagonal cells of the transition matrix.
export const ACTIVITIES = [
  { key: "construction", label: "New construction", query: "where buildings increased", test: (f, t) => t === 5 },
  { key: "removal", label: "Structure removal", query: "buildings decreased", test: (f) => f === 5 },
  { key: "clearing", label: "Vegetation clearing", query: "vegetation converted to bare ground", test: (f, t) => (f === 2 || f === 3) && t === 1 },
  { key: "water", label: "Water body change", query: "water", test: (f, t) => f === 4 || t === 4 },
  { key: "regrowth", label: "Vegetation regrowth", query: "bare ground converted to vegetation", test: (f, t) => f === 1 && (t === 2 || t === 3) },
  { key: "vegshift", label: "Vegetation type shift", query: "trees became low vegetation", test: (f, t) => (f === 2 && t === 3) || (f === 3 && t === 2) },
  { key: "other", label: "Other surface change", query: null, test: () => true },
];
export const activityOf = (f, t) => ACTIVITIES.find((a) => a.test(f, t));

/** 6x6 matrix (rows = before, cols = after, 0-based) -> activities with summed px. */
export function activityTotals(matrix) {
  const px = Object.fromEntries(ACTIVITIES.map((a) => [a.key, 0]));
  matrix?.forEach((row, i) =>
    row.forEach((v, j) => {
      if (i !== j && v) px[activityOf(i + 1, j + 1).key] += v;
    }),
  );
  return ACTIVITIES.map((a) => ({ ...a, px: px[a.key] }));
}

/** Index records carry transition_vec (matrix / changed_px) instead of the matrix. */
export function matrixOf(rec) {
  if (rec?.transition_matrix) return rec.transition_matrix;
  if (!rec?.transition_vec) return null;
  return Array.from({ length: 6 }, (_, i) =>
    rec.transition_vec.slice(i * 6, i * 6 + 6).map((v) => v * rec.changed_px),
  );
}

export function dominantActivity(rec) {
  return activityTotals(matrixOf(rec))
    .filter((a) => a.px > 0)
    .sort((a, b) => b.px - a.px)[0];
}

export const primaryActivityKey = (card) => {
  const t = card.top_transitions?.[0];
  return t ? activityOf(t.from_idx, t.to_idx).key : "none";
};

export const fmtInt = (n) => Math.round(n ?? 0).toLocaleString("en-US");
export const fmtPct = (n, d = 1) => `${Number(n ?? 0).toFixed(d)}%`;
export const signed = (n, d = 1) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(Number(n)).toFixed(d)}`;
