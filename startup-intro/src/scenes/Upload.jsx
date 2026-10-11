// Upload, white: the app's batch analysis (views/Analyze.jsx). Four before/after pairs drop in, "Run change
// analysis" is pressed, the results table fills row by row, and "Print all briefs" lands with "print a
// brief for each". Rows are the model's results for those test pairs (data/analyzed/index.json; an
// upload of the same files gives the same record, matched to its tile by file name).
import { Img, staticFile } from "remotion";
import { C, CLASS_COLOR } from "../theme";
import { Click, FadeUp, LevelBadge, Overlay, Page, ScaleIn, SHADOW, useIn, usePress } from "../ui";

// [pair, % of frame changed, top transition from, to]
const PAIRS = [
  ["00003", 44.0, "tree", "low vegetation"],
  ["00045", 34.2, "buildings", "non-vegetated ground"],
  ["00020", 19.3, "non-vegetated ground", "low vegetation"],
  ["00046", 7.3, "non-vegetated ground", "tree"],
];
const SHORT = { "non-vegetated ground": "Ground", tree: "Tree", "low vegetation": "Low veg", buildings: "Buildings" };
const COLS = [250, 250, 170, 160, 130, 290, 150]; // Before, After, Status, Level, Changed, Primary transition, Matched tile

function Zone({ label, sub, prefix, start }) {
  return (
    <div style={{ flex: 1, border: `1.5px dashed #CBD0D8`, borderRadius: 14, padding: "18px 22px" }}>
      <div style={{ fontSize: 20, fontWeight: 600 }}>
        {label} <span style={{ fontWeight: 400, color: C.muted, fontSize: 18 }}>· {sub}</span>
      </div>
      <div style={{ display: "flex", gap: 14, marginTop: 16 }}>
        {PAIRS.map(([id], i) => (
          <FadeUp key={id} start={start + i * 5} dur={22} rise={-30}>
            <Img src={staticFile(`${prefix}_${id}.png`)} style={{ width: 96, height: 96, borderRadius: 8, display: "block" }} />
          </FadeUp>
        ))}
      </div>
    </div>
  );
}

function Button({ children, at, primary }) {
  const s = usePress(at);
  return (
    <div
      style={{
        padding: "13px 24px", borderRadius: 12, fontSize: 20, fontWeight: 600, transform: `scale(${s})`,
        background: primary ? C.accent : C.white, color: primary ? "#fff" : C.text, border: primary ? "none" : `1px solid ${C.line}`,
      }}
    >
      {children}
    </div>
  );
}

function Cell({ i, children, style }) {
  return <div style={{ width: COLS[i], flex: "none", ...style }}>{children}</div>;
}

function Row({ pair, start, done }) {
  const [id, pct, from, to] = pair;
  const ready = useIn(done, 16);
  const running = useIn(start, 1) - ready;
  const result = { opacity: ready };
  return (
    <FadeUp start={start} rise={20} style={{ display: "flex", alignItems: "center", height: 60, borderTop: `1px solid ${C.line}`, fontSize: 19 }}>
      <Cell i={0} style={{ display: "flex", alignItems: "center", gap: 12, fontVariantNumeric: "tabular-nums" }}>
        <Overlay src={`ov_${id}.png`} size={38} radius={6} style={{ opacity: ready }} />
        {id}_before.png
      </Cell>
      <Cell i={1} style={{ fontVariantNumeric: "tabular-nums" }}>{id}_after.png</Cell>
      <Cell i={2}>
        {ready > 0.5 ? <span style={{ color: "#2F8A57", fontWeight: 500 }}>Done</span> : <span style={{ color: "#B7791F", opacity: running > 0 ? 1 : 0.5 }}>Analyzing…</span>}
      </Cell>
      <Cell i={3} style={result}><LevelBadge pct={pct} size={19} /></Cell>
      <Cell i={4} style={{ ...result, fontVariantNumeric: "tabular-nums" }}>{pct.toFixed(1)}%</Cell>
      <Cell i={5} style={{ ...result, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 13, height: 13, borderRadius: 3, background: CLASS_COLOR[from] }} /> {SHORT[from]}
        <span style={{ color: C.muted }}>→</span>
        <span style={{ width: 13, height: 13, borderRadius: 3, background: CLASS_COLOR[to] }} /> {SHORT[to]}
      </Cell>
      <Cell i={6} style={{ ...result, color: C.muted, fontVariantNumeric: "tabular-nums" }}>{id}</Cell>
    </FadeUp>
  );
}

export function Upload({ vo }) {
  const run = 56;
  const print = Math.round(vo * 0.7); // "...and print a brief for each"
  return (
    <Page>
      <FadeUp style={{ fontSize: 64, fontWeight: 600, letterSpacing: "-0.03em", marginBottom: 36 }}>Analyze your own imagery.</FadeUp>
      <ScaleIn start={6}>
        <div style={{ width: 1560, padding: "30px 36px", background: C.white, border: `1px solid ${C.line}`, borderRadius: 18, boxShadow: SHADOW }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div style={{ fontSize: 24, fontWeight: 600 }}>Assess new before / after pairs</div>
            <Button primary at={run}>Run change analysis</Button>
          </div>
          <div style={{ display: "flex", gap: 20 }}>
            <Zone label="Before" sub="Earlier acquisitions" prefix="im1" start={12} />
            <Zone label="After" sub="Later acquisitions" prefix="im2" start={22} />
          </div>

          <div style={{ marginTop: 24 }}>
            <FadeUp start={run + 4} style={{ display: "flex", height: 40, alignItems: "center", fontSize: 17, color: C.muted }}>
              {["Before", "After", "Status", "Level", "Changed", "Primary transition", "Matched tile"].map((h, i) => (
                <Cell key={h} i={i}>{h}</Cell>
              ))}
            </FadeUp>
            {PAIRS.map((p, i) => (
              <Row key={p[0]} pair={p} start={run + 6 + i * 4} done={run + 24 + i * 16} />
            ))}
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
            <FadeUp start={print - 24}>
              <Button at={print}>Print all briefs</Button>
            </FadeUp>
          </div>
        </div>
      </ScaleIn>
      <Click at={run} />
      <Click at={print} />
    </Page>
  );
}
