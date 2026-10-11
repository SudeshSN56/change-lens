// 23.5-30.5 s: a plain-language question types in, the parsed filter shows, real result tiles pop in.
import { Img, staticFile, useCurrentFrame } from "remotion";
import { C } from "../theme";
import { Cursor, Paper, Selected, Typed, Win, usePop } from "../ui";

// Live results of /api/query "where did trees become buildings" (first six).
const RESULTS = [
  ["07606", "hangzhou", "14.0%"],
  ["02131", "shanghai", "26.1%"],
  ["02496", "chengdu", "50.7%"],
  ["04900", "hangzhou", "22.4%"],
  ["10322", "shanghai", "21.3%"],
  ["05570", "hangzhou", "26.0%"],
];

function Token({ delay }) {
  const p = usePop(delay);
  return (
    <div style={{ position: "absolute", left: 172, top: 300, display: "flex", gap: 22, alignItems: "center", fontSize: 26, opacity: p }}>
      <span style={{ padding: "6px 14px", background: C.blue, color: C.ink, fontWeight: 600 }}>transition</span>
      <span style={{ fontWeight: 500 }}>tree -&gt; buildings</span>
      <span style={{ color: "#6d6d6d", fontSize: 22 }}>parsed by rules, no inference</span>
    </div>
  );
}

export function Query() {
  const frame = useCurrentFrame();
  const size = 250;
  return (
    <Paper grid>
      <Win title="query" x={160} y={110} w={1600} h={150}>
        <div style={{ display: "flex", alignItems: "center", height: "100%", padding: "0 26px", gap: 22, fontSize: 40 }}>
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="2.2" strokeLinecap="round">
            <path d="M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14M21 21l-5-5" />
          </svg>
          <div style={{ flex: 1 }}>
            <Typed text="where did trees become buildings" start={8} cps={24} caret={frame < 62} />
          </div>
          <div style={{ padding: "12px 24px", background: frame >= 62 ? C.ink : C.blue, color: frame >= 62 ? "#fff" : C.ink, fontSize: 24, fontWeight: 600 }}>
            run query
          </div>
        </div>
      </Win>

      {frame >= 70 && <Token delay={70} />}

      {RESULTS.map(([id, sector, pct], i) => (
        <Win key={id} title={id} x={160 + i * (size + 20)} y={400} w={size + 4} h={size + 44 + 56} delay={86 + i * 6}>
          <Img src={staticFile(`q_${id}.png`)} style={{ width: size, height: size, display: "block" }} />
          <div style={{ display: "flex", justifyContent: "space-between", padding: "14px 14px", fontSize: 20 }}>
            <span>{sector}</span>
            <span style={{ fontWeight: 600 }}>{pct}</span>
          </div>
        </Win>
      ))}

      <div style={{ position: "absolute", left: 172, top: 830, fontSize: 46, fontWeight: 500 }}>
        {frame >= 130 && (
          <span>
            ask in plain words. <Selected start={150} dur={12}>get the tiles.</Selected>
          </span>
        )}
      </div>

      <Cursor
        path={[
          [0, 1250, 560],
          [50, 1640, 240],
          [62, 1660, 188],
          [100, 1500, 300],
          [150, 760, 560],
          [210, 720, 600],
        ]}
        clicks={[62]}
      />
    </Paper>
  );
}
