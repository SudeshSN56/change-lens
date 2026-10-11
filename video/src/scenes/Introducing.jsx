// 3-6.5 s: "introducing" stacked from light to bold, then a lens window slides over the heaviest line.
import { interpolate, useCurrentFrame } from "remotion";
import { C } from "../theme";
import { Cursor, Paper, Typed, Win } from "../ui";

const WEIGHTS = [300, 300, 400, 500, 600, 700];

export function Introducing() {
  const frame = useCurrentFrame();
  const lensX = interpolate(frame, [62, 80], [1500, 880], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <Paper>
      <div style={{ position: "absolute", left: 640, top: 175, display: "grid", gap: 4 }}>
        {WEIGHTS.map((w, i) => (
          <div key={i} style={{ position: "relative", fontSize: 96, lineHeight: 1.05, fontWeight: w }}>
            {i === WEIGHTS.length - 1 && frame > 40 && (
              <span style={{ position: "absolute", left: 5, top: 5, color: C.blue }}>introducing</span>
            )}
            <Typed text="introducing" start={i * 6} cps={60} caret={i === WEIGHTS.length - 1} style={{ position: "relative" }} />
          </div>
        ))}
      </div>
      {frame >= 62 && (
        <Win title="lens" x={lensX} y={720} w={300} h={170} bodyStyle={{ display: "grid", placeItems: "center" }}>
          {/* glyph view, like the reference's window over "introducing" */}
          <span style={{ fontSize: 150, lineHeight: 1, fontWeight: 300, color: "transparent", WebkitTextStroke: `2px ${C.blue}` }}>o</span>
        </Win>
      )}
      <Cursor
        path={[
          [0, 1480, 860],
          [40, 1420, 760],
          [62, 1520, 800],
          [80, 900, 780],
          [105, 880, 770],
        ]}
        clicks={[62]}
      />
    </Paper>
  );
}
