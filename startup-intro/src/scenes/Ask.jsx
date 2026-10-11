// Scene 3, white: the app's search box. A real query types in, the app's other example chips sit
// below it, and the real top results for that query rise in as cards.
import { Html5Audio, Sequence, staticFile, useVideoConfig } from "remotion";
import { C, CLASS_COLOR } from "../theme";
import { FadeUp, Overlay, Page, ScaleIn, Typed, typeFrames, useIn } from "../ui";

const QUERY = "where did trees become buildings";
// The other example chips on the app's search page (src/api.py, /api/examples).
const CHIPS = ["vegetation decreased", "urbanization in Shanghai", "tree loss over 10%", "changes in Chengdu", "most changed areas"];
// Live results of /api/query for QUERY (first six): tile, sector, changed share of the frame.
const RESULTS = [
  ["07606", "Hangzhou", "14.0%"],
  ["02131", "Shanghai", "26.1%"],
  ["02496", "Chengdu", "50.7%"],
  ["04900", "Hangzhou", "22.4%"],
  ["10322", "Shanghai", "21.3%"],
  ["05570", "Hangzhou", "26.0%"],
];

const TYPE_AT = 18;

function SearchIcon() {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round">
      <path d="M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14M21 21l-5-5" />
    </svg>
  );
}

function Submit({ at }) {
  const press = useIn(at, 6) - useIn(at + 6, 12); // dips and comes back
  return (
    <div
      style={{
        width: 64, height: 64, borderRadius: 16, background: C.accent, display: "grid", placeItems: "center",
        transform: `scale(${1 - 0.08 * press})`,
      }}
    >
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12h14M13 6l6 6-6 6" />
      </svg>
      <Sequence from={at} durationInFrames={20} layout="none">
        <Html5Audio src={staticFile("audio/click.wav")} volume={0.5} />
      </Sequence>
    </div>
  );
}

function Result({ id, sector, pct, start }) {
  return (
    <FadeUp start={start} dur={36} rise={32}>
      <div
        style={{
          width: 190, padding: 8, borderRadius: 16, background: C.white, border: `1px solid ${C.line}`,
          boxShadow: "0 1px 2px rgba(16,24,40,0.04), 0 10px 28px rgba(16,24,40,0.07)",
        }}
      >
        <Overlay src={`q_${id}.png`} size={172} />
        <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 4px 2px", fontSize: 19 }}>
          <span style={{ fontWeight: 500 }}>{sector}</span>
          <span style={{ color: C.muted, fontVariantNumeric: "tabular-nums" }}>{pct}</span>
        </div>
      </div>
    </FadeUp>
  );
}

function Swatch({ color }) {
  return <span style={{ width: 14, height: 14, borderRadius: 3, background: color, display: "inline-block" }} />;
}

export function Ask({ vo }) {
  const { fps } = useVideoConfig();
  const submitAt = TYPE_AT + typeFrames(QUERY, fps) + 8;
  const chipsOut = useIn(submitAt, 10);
  return (
    <Page>
      <FadeUp style={{ fontSize: 72, fontWeight: 600, letterSpacing: "-0.03em" }}>Ask in plain English.</FadeUp>
      {/* the second sentence lands with the voice, about halfway through the line */}
      <FadeUp start={Math.round(vo * 0.52)} style={{ fontSize: 40, color: C.muted, marginTop: 14 }}>
        Get the places that match.
      </FadeUp>

      <ScaleIn start={10} style={{ marginTop: 56 }}>
        <div
          style={{
            width: 1240, height: 104, borderRadius: 22, background: C.white, border: `1px solid ${C.line}`,
            boxShadow: "0 1px 2px rgba(16,24,40,0.04), 0 16px 40px rgba(16,24,40,0.08)",
            display: "flex", alignItems: "center", gap: 22, padding: "0 20px 0 30px",
          }}
        >
          <SearchIcon />
          <div style={{ flex: 1, fontSize: 36 }}>
            <Typed parts={[[QUERY]]} start={TYPE_AT} />
          </div>
          <Submit at={submitAt} />
        </div>
      </ScaleIn>

      {/* on submit the example chips give way to the parsed filter, which is how the app explains a result */}
      <div style={{ position: "relative", marginTop: 24 }}>
        <div style={{ display: "flex", gap: 12, opacity: 1 - chipsOut }}>
          {CHIPS.map((chip, i) => (
            <FadeUp key={chip} start={14 + i * 4} rise={25}>
              <div style={{ padding: "9px 18px", borderRadius: 999, background: C.panel, color: "#374151", fontSize: 20, fontWeight: 500 }}>
                {chip}
              </div>
            </FadeUp>
          ))}
        </div>
        <FadeUp start={submitAt + 6} style={{ position: "absolute", inset: 0, display: "flex", justifyContent: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 20px", borderRadius: 999, background: C.panel, fontSize: 21 }}>
            <span style={{ color: C.muted }}>Transition</span>
            <Swatch color={CLASS_COLOR.tree} /> tree <span style={{ color: C.muted }}>→</span> <Swatch color={CLASS_COLOR.buildings} /> buildings
          </div>
        </FadeUp>
      </div>

      <div style={{ display: "flex", gap: 20, marginTop: 48 }}>
        {RESULTS.map(([id, sector, pct], i) => (
          <Result key={id} id={id} sector={sector} pct={pct} start={submitAt + 10 + i * 5} />
        ))}
      </div>
    </Page>
  );
}
