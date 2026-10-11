// Overview, white: the app's situation overview as a light UI. KPI strip, change level distribution and
// activity breakdown, all computed from data/analyzed/index.json with the app's own definitions
// (frontend/src/lib/constants.js: LEVELS, ACTIVITIES).
import { C, levelOf, LEVELS } from "../theme";
import { FadeUp, Page, Panel, ScaleIn, SHADOW, useCount, useIn } from "../ui";

// Tiles per 5% bin of frame changed, 0-75% (the bins above 75% are empty).
const BINS = [96, 165, 135, 95, 65, 52, 37, 34, 24, 13, 8, 8, 5, 4, 1];
const LEVEL_COUNTS = { Severe: 63, High: 123, Moderate: 295, Low: 261 };
// Share of all changed pixels by transition type.
const ACTIVITY = [
  ["New construction", 46.7],
  ["Vegetation regrowth", 16.4],
  ["Vegetation clearing", 14.5],
  ["Structure removal", 13.5],
  ["Vegetation type shift", 4.5],
  ["Water body change", 3.0],
  ["Other surface change", 1.5],
];

function Kpi({ label, value, sub, first }) {
  return (
    <div style={{ flex: 1, padding: "24px 28px", borderLeft: first ? "none" : `1px solid ${C.line}` }}>
      <div style={{ fontSize: 18, color: C.muted }}>{label}</div>
      <div style={{ fontSize: 46, fontWeight: 600, letterSpacing: "-0.02em", marginTop: 6, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div style={{ fontSize: 17, color: C.muted, marginTop: 6 }}>{sub}</div>
    </div>
  );
}

function Bin({ n, i }) {
  const p = useIn(34 + i * 2, 30);
  return (
    <div style={{ flex: 1, display: "flex", alignItems: "flex-end", height: 210 }}>
      <div style={{ width: "100%", height: (n / 165) * 210 * p, borderRadius: "4px 4px 0 0", background: levelOf(i * 5).color }} />
    </div>
  );
}

function ActivityRow({ label, pct, i }) {
  const p = useIn(40 + i * 4, 36);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 19, height: 33 }}>
      <span style={{ width: 230 }}>{label}</span>
      <div style={{ flex: 1, height: 8, borderRadius: 4, background: C.panel }}>
        <div style={{ width: `${(pct / 46.7) * 100 * p}%`, height: "100%", borderRadius: 4, background: C.accent }} />
      </div>
      <span style={{ width: 62, textAlign: "right", color: C.muted, fontVariantNumeric: "tabular-nums" }}>{pct.toFixed(1)}%</span>
    </div>
  );
}

export function Overview() {
  const tiles = Math.round(useCount(742, 10));
  const priority = Math.round(useCount(186, 14));
  const mean = useCount(18.0, 18);
  return (
    <Page>
      <FadeUp style={{ fontSize: 64, fontWeight: 600, letterSpacing: "-0.03em", marginBottom: 40 }}>Every sector at a glance.</FadeUp>

      <ScaleIn start={6}>
        <div style={{ width: 1560, display: "flex", background: C.white, border: `1px solid ${C.line}`, borderRadius: 18, boxShadow: SHADOW }}>
          <Kpi first label="Tiles under watch" value={tiles} sub="Hangzhou · Chengdu · Shanghai" />
          <Kpi label="Priority tiles" value={priority} sub="63 severe · 123 high" />
          <Kpi label="Mean change per tile" value={`${mean.toFixed(1)}%`} sub="Median 14.2% of frame" />
          <Kpi label="Dominant activity" value={<span style={{ fontSize: 36 }}>New construction</span>} sub="46.7% of all changed pixels" />
        </div>
      </ScaleIn>

      <div style={{ display: "flex", gap: 24, marginTop: 24, width: 1560 }}>
        <FadeUp start={20} rise={30} style={{ flex: 1 }}>
          <Panel title="Change level distribution" sub="Tiles by share of frame changed, in 5% bins" style={{ height: 400 }}>
            <div style={{ display: "flex", gap: 6, marginTop: 26 }}>
              {BINS.map((n, i) => (
                <Bin key={i} n={n} i={i} />
              ))}
            </div>
            <div style={{ display: "flex", gap: 22, marginTop: 18, fontSize: 18 }}>
              {LEVELS.map((l) => (
                <span key={l.label} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: l.color }} />
                  {l.label} <b style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{LEVEL_COUNTS[l.label]}</b>
                </span>
              ))}
            </div>
          </Panel>
        </FadeUp>
        <FadeUp start={28} rise={30} style={{ flex: 1 }}>
          <Panel title="Activity breakdown" sub="Share of all changed pixels by transition type" style={{ height: 400 }}>
            <div style={{ marginTop: 22 }}>
              {ACTIVITY.map(([label, pct], i) => (
                <ActivityRow key={label} label={label} pct={pct} i={i} />
              ))}
            </div>
          </Panel>
        </FadeUp>
      </div>
    </Page>
  );
}
