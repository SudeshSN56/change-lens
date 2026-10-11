// Tile assessment, dark, across two lines of the voice (one window, no cuts):
//   1 "compare before and after"   the window scales in and the swipe sweeps from before to after,
//   2 "labels every changed pixel"  the model's change map fades in and "What changed" fills.
// All values are tile 02353's (data/analyzed/02353.json). Fades in from and out to white.
import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { C, CLASS_COLOR, EASE } from "../theme";
import { FadeUp, LEGEND_CROP, Page, Push, ScaleIn, useIn } from "../ui";

// [from, to, model % of frame]
const TRANSITIONS = [
  ["non-vegetated ground", "buildings", 40.45],
  ["non-vegetated ground", "low vegetation", 17.7],
  ["non-vegetated ground", "tree", 6.04],
];
const SHORT = { "non-vegetated ground": "Ground", buildings: "Buildings", "low vegetation": "Low veg", tree: "Tree" };
const CHANGED = 70.53;
const HEADLINES = ["Before and after, side by side.", "Every changed pixel, labelled."];
const IMG = 660;
const FADE = 8;
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" };

function Layer({ src, style }) {
  // every layer gets the overlays' legend crop, so the photos and the maps stay registered
  return <Img src={staticFile(src)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", ...LEGEND_CROP, ...style }} />;
}

function Tag({ side, children, opacity = 1 }) {
  return (
    <div
      style={{
        position: "absolute", top: 16, [side]: 16, padding: "7px 14px", borderRadius: 8, opacity,
        background: "rgba(8,8,8,0.72)", color: C.winText, fontSize: 18, fontWeight: 500,
      }}
    >
      {children}
    </div>
  );
}

function Preview({ c }) {
  const frame = useCurrentFrame();
  const opt = { ...clamp, easing: Easing.bezier(...EASE) };
  // Left edge of the "after" image, in % of the width: all before, sweep to nearly all after, settle mid-way.
  const mid = Math.round((40 + c[1]) / 2);
  const pos = frame < mid ? interpolate(frame, [40, mid], [100, 12], opt) : interpolate(frame, [mid, c[1] - 6], [12, 50], opt);
  const map = useIn(c[1], 24);
  return (
    <div style={{ position: "relative", width: IMG, height: IMG, borderRadius: 12, overflow: "hidden", background: "#000" }}>
      <Layer src="02353_before.png" />
      <Layer src="02353_after.png" style={{ clipPath: `inset(0 0 0 ${pos}%)` }} />
      <Layer src="02353_map.png" style={{ opacity: map }} />
      <div style={{ position: "absolute", top: 0, bottom: 0, left: `${pos}%`, width: 2, marginLeft: -1, background: "#fff", opacity: 1 - map }}>
        <div
          style={{
            position: "absolute", top: "50%", left: "50%", width: 44, height: 44, transform: "translate(-50%, -50%)",
            borderRadius: "50%", background: "#fff", boxShadow: "0 4px 14px rgba(0,0,0,0.35)", display: "grid", placeItems: "center",
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.text} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 6l-6 6 6 6M15 6l6 6-6 6" />
          </svg>
        </div>
      </div>
      <Tag side="left" opacity={1 - map}>Before · 2017-02-14</Tag>
      {pos < 88 && <Tag side="right" opacity={1 - map}>After · 2019-02-06</Tag>}
      <Tag side="left" opacity={map}>Model prediction</Tag>
    </div>
  );
}

function Swatch({ cls }) {
  return <span style={{ width: 14, height: 14, borderRadius: 3, background: CLASS_COLOR[cls], display: "inline-block", flex: "none" }} />;
}

function PanelTitle({ children }) {
  return <div style={{ fontSize: 18, fontWeight: 500, color: C.winMuted, marginBottom: 22 }}>{children}</div>;
}

function Row({ t, start }) {
  const [from, to, model] = t;
  const p = useIn(start, 36);
  const v = model * p;
  return (
    <FadeUp start={start} rise={25} style={{ marginBottom: 30 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 21, whiteSpace: "nowrap" }}>
        <Swatch cls={from} />
        <span>{SHORT[from]}</span>
        <span style={{ color: C.winMuted }}>→</span>
        <Swatch cls={to} />
        <span>{SHORT[to]}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 12 }}>
        <div style={{ flex: 1, height: 6, borderRadius: 3, background: "#1E2024" }}>
          <div style={{ width: `${(v / TRANSITIONS[0][2]) * 100}%`, height: "100%", borderRadius: 3, background: C.accent }} />
        </div>
        <span style={{ width: 62, textAlign: "right", fontSize: 19, color: C.winMuted, fontVariantNumeric: "tabular-nums" }}>{v.toFixed(1)}%</span>
      </div>
    </FadeUp>
  );
}

export function Tile({ len, cues, vos }) {
  const frame = useCurrentFrame();
  const c = cues;
  const step = frame < c[1] ? 0 : 1;
  const fill = c[1] + Math.round(vos[1] * 0.45); // "...so you see what turned into what"
  const white = 1 - useIn(0, FADE) + interpolate(frame, [len - FADE, len], [0, 1], clamp);
  const record = [
    ["Sector", "Chengdu"],
    ["Before image", "2017-02-14"],
    ["After image", "2019-02-06"],
    ["Changed", `${CHANGED}% of frame`],
  ];
  return (
    <Page dark>
      <Push len={len} amount={0.03}>
        {/* one headline per line of the voice; each new one fades up as its line starts */}
        <FadeUp key={step} start={step === 0 ? 10 : c[step]} style={{ fontSize: 52, fontWeight: 600, letterSpacing: "-0.025em", marginBottom: 34 }}>
          {HEADLINES[step]}
        </FadeUp>
        <ScaleIn start={0} dur={40}>
          <div style={{ width: 1500, borderRadius: 20, background: C.win, border: `1px solid ${C.winLine}`, boxShadow: "0 40px 120px rgba(0,0,0,0.55)", overflow: "hidden" }}>
            <div style={{ height: 52, display: "flex", alignItems: "center", padding: "0 20px", borderBottom: `1px solid ${C.winLine}`, position: "relative" }}>
              <div style={{ display: "flex", gap: 9 }}>
                {[0, 1, 2].map((i) => (
                  <span key={i} style={{ width: 13, height: 13, borderRadius: "50%", background: "#34373C" }} />
                ))}
              </div>
              <div style={{ position: "absolute", left: 0, right: 0, textAlign: "center", fontSize: 18, color: C.winMuted }}>Tile 02353</div>
            </div>

            <div style={{ display: "flex", height: 800 }}>
              <div style={{ width: 360, padding: "36px 34px", borderRight: `1px solid ${C.winLine}` }}>
                <FadeUp start={40}>
                  <PanelTitle>Record</PanelTitle>
                </FadeUp>
                {record.map(([k, v], i) => (
                  <FadeUp key={k} start={46 + i * 6} rise={25} style={{ marginBottom: 22 }}>
                    <div style={{ fontSize: 17, color: C.winMuted }}>{k}</div>
                    <div style={{ fontSize: 23, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>{v}</div>
                  </FadeUp>
                ))}
              </div>

              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <Preview c={c} />
              </div>

              <div style={{ width: 360, padding: "36px 34px", borderLeft: `1px solid ${C.winLine}` }}>
                <FadeUp start={fill}>
                  <PanelTitle>What changed</PanelTitle>
                </FadeUp>
                {TRANSITIONS.map((t, i) => (
                  <Row key={t[1]} t={t} start={fill + 6 + i * 8} />
                ))}
              </div>
            </div>
          </div>
        </ScaleIn>
      </Push>
      <AbsoluteFill style={{ background: C.white, opacity: white, pointerEvents: "none" }} />
    </Page>
  );
}
