// 35.5-40.5 s: the real console, as two browser windows on paper.
import { Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { Cursor, Paper, Typed, Win } from "../ui";

export function Product() {
  const frame = useCurrentFrame();
  const slide = interpolate(frame, [34, 52], [700, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const w = 1040;
  const h = Math.round((w * 1000) / 1600);
  return (
    <Paper grid>
      <Win title="localhost:8000 · situation overview" x={110} y={90} w={w + 4} h={h + 44}>
        <Img src={staticFile("ui-overview.png")} style={{ width: w, display: "block" }} />
      </Win>
      <div style={{ position: "absolute", inset: 0, transform: `translateX(${slide}px)` }}>
        <Win title="localhost:8000 · tile 02353" x={760} y={330} w={w + 4} h={h + 44} delay={34}>
          <Img src={staticFile("ui-tile.png")} style={{ width: w, display: "block" }} />
        </Win>
      </div>
      <div style={{ position: "absolute", left: 120, top: 860, fontSize: 46, fontWeight: 500, lineHeight: 1.2 }}>
        <Typed text="overview. search. compare." start={70} cps={30} />
      </div>
      <Cursor
        path={[
          [0, 900, 600],
          [60, 1200, 700],
          [110, 1040, 640],
          [150, 1100, 660],
        ]}
        clicks={[112]}
      />
    </Paper>
  );
}
