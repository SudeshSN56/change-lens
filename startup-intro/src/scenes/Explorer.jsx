// Explorer, white: the app's tile explorer. The filters step in with the voice ("filtered by city, change
// level, and activity") and the grid narrows each time. Every state is real: computed from
// data/analyzed/index.json the way views/Explorer.jsx filters (level counts ignore the level filter,
// sorted by change, descending).
import { useCurrentFrame } from "remotion";
import { C, LEVELS } from "../theme";
import { Click, FadeUp, Overlay, Page, ScaleIn, SHADOW, useIn, usePress } from "../ui";

const ALL = ["Severe", "High", "Moderate", "Low"];
const STATES = [
  {
    sector: "All sectors", levels: ALL, activity: "All activity", counts: [63, 123, 295, 261], total: 742,
    tiles: [["02353", 70.5], ["02525", 68.7], ["04208", 68.1], ["11528", 68.1], ["02577", 67.4], ["02360", 64.0], ["00289", 63.7], ["10997", 63.2], ["04618", 62.9], ["05593", 60.7]],
  },
  {
    sector: "Chengdu", levels: ALL, activity: "All activity", counts: [23, 46, 91, 89], total: 249,
    tiles: [["02353", 70.5], ["00289", 63.7], ["05593", 60.7], ["03314", 59.6], ["08607", 58.0], ["02247", 57.6], ["10838", 57.6], ["04222", 57.5], ["10520", 52.2], ["02378", 52.0]],
  },
  { sector: "Chengdu", levels: ["Severe"], activity: "All activity", counts: [23, 46, 91, 89], total: 23 }, // same tiles as above
  {
    sector: "Chengdu", levels: ["Severe"], activity: "New construction", counts: [17, 26, 47, 39], total: 17,
    tiles: [["02353", 70.5], ["05593", 60.7], ["03314", 59.6], ["02247", 57.6], ["10838", 57.6], ["04222", 57.5], ["10520", 52.2], ["02496", 50.7], ["05580", 49.7], ["00638", 48.8]],
  },
];

function Label({ children }) {
  return <div style={{ fontSize: 17, color: C.muted, margin: "0 0 10px" }}>{children}</div>;
}

function Select({ value, at }) {
  const s = usePress(at);
  return (
    <div
      style={{
        display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", fontSize: 20,
        border: `1px solid ${C.line}`, borderRadius: 10, transform: `scale(${s})`, marginBottom: 30,
      }}
    >
      {value}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2.4" strokeLinecap="round">
        <path d="M6 9l6 6 6-6" />
      </svg>
    </div>
  );
}

function Toggle({ level, count, on, at }) {
  const s = usePress(at);
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 9, padding: "10px 12px", borderRadius: 10, fontSize: 18,
        border: `1px solid ${on ? C.text : C.line}`, background: on ? C.panel : C.white, color: on ? C.text : C.muted,
        transform: `scale(${s})`,
      }}
    >
      <span style={{ width: 9, height: 9, borderRadius: "50%", background: level.color, opacity: on ? 1 : 0.4 }} />
      {level.label}
      <b style={{ marginLeft: "auto", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{count}</b>
    </div>
  );
}

function Thumb({ tile }) {
  const [id, pct] = tile;
  return (
    <>
      <Overlay src={`ov_${id}.png`} size={200} />
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18, marginTop: 8, fontVariantNumeric: "tabular-nums" }}>
        <span style={{ fontWeight: 500 }}>{id}</span>
        <span style={{ color: C.muted }}>{pct.toFixed(1)}%</span>
      </div>
    </>
  );
}

/** One grid cell: the new tile rises in over the one it replaces, which fades out underneath. */
function Cell({ tile, prev, start }) {
  const out = useIn(start + 6, 14);
  return (
    <div style={{ position: "relative" }}>
      {prev && (
        <div style={{ position: "absolute", inset: 0, opacity: 1 - out }}>
          <Thumb tile={prev} />
        </div>
      )}
      <FadeUp start={start} dur={22} rise={25} style={{ position: "relative" }}>
        <Thumb tile={tile} />
      </FadeUp>
    </div>
  );
}

const listAt = (k) => {
  while (!STATES[k].tiles) k--; // a state without tiles keeps the previous list
  return k;
};

export function Explorer({ vo }) {
  const frame = useCurrentFrame();
  // clicks a little ahead of the words "city", "change level" and "activity", so the last grid can settle
  const at = [0, Math.round(vo * 0.34), Math.round(vo * 0.5), Math.round(vo * 0.64)];
  let k = 0;
  while (k + 1 < STATES.length && frame >= at[k + 1]) k++;
  const st = STATES[k];
  const first = listAt(k); // the grid only re-animates when its list of tiles changes
  const tiles = STATES[first].tiles;
  const prev = first > 0 ? STATES[listAt(first - 1)].tiles : null;
  const t0 = first === 0 ? 14 : at[first];
  return (
    <Page>
      <FadeUp style={{ fontSize: 64, fontWeight: 600, letterSpacing: "-0.03em", marginBottom: 40 }}>Filter by city, level and activity.</FadeUp>
      <ScaleIn start={6}>
        <div
          style={{
            width: 1560, display: "flex", gap: 40, padding: 36, background: C.white, border: `1px solid ${C.line}`,
            borderRadius: 18, boxShadow: SHADOW,
          }}
        >
          <div style={{ width: 360, flex: "none" }}>
            <Label>Sector</Label>
            <Select value={st.sector} at={at[1]} />
            <Label>Change level</Label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 30 }}>
              {LEVELS.map((l, i) => (
                <Toggle key={l.label} level={l} count={st.counts[i]} on={st.levels.includes(l.label)} at={l.label === "Severe" ? at[2] : -99} />
              ))}
            </div>
            <Label>Primary activity</Label>
            <Select value={st.activity} at={at[3]} />
          </div>

          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 20, color: C.muted, marginBottom: 16, fontVariantNumeric: "tabular-nums" }}>
              <b style={{ color: C.text, fontWeight: 600 }}>{st.total}</b> tiles · sorted by change
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 200px)", gap: 22 }}>
              {tiles.map((tile, i) => (
                <Cell key={`${first}-${i}`} tile={tile} prev={prev?.[i]} start={t0 + i * 2} />
              ))}
            </div>
          </div>
        </div>
      </ScaleIn>
      {at.slice(1).map((f) => (
        <Click key={f} at={f} volume={0.4} />
      ))}
    </Page>
  );
}
