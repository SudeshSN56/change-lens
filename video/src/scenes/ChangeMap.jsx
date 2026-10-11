// 18-23.5 s: the same window turns into the model's change map; the numbers for the tile pop in beside it.
import { Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { CLASSES, C } from "../theme";
import { Cursor, Paper, Rows, Win } from "../ui";
import { TILE } from "./BeforeAfter";

const count = (frame, start, to, digits = 0) =>
  interpolate(frame, [start, start + 24], [0, to], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

function Sw({ color, size = 18 }) {
  return <span style={{ display: "inline-block", width: size, height: size, background: color, outline: "1px solid #0003", marginRight: 12, verticalAlign: "-2px" }} />;
}

export function ChangeMap() {
  const frame = useCurrentFrame();
  const map = interpolate(frame, [8, 34], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <Paper grid>
      <Win title="change map · model prediction" x={TILE.x} y={TILE.y} w={TILE.size + 4} h={TILE.size + 44} pop={false}>
        <Img src={staticFile("02353_after.png")} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", filter: "grayscale(1)" }} />
        <Img src={staticFile("02353_map.png")} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: map }} />
      </Win>

      <Win title="change / units" x={1100} y={108} w={600} h={250} delay={30}>
        <Rows
          size={22}
          rows={[
            ["frame changed", `${count(frame, 32, 70.53, 2)}%`],
            ["changed pixels", count(frame, 32, 184898)],
            ["change level", "severe"],
            ["dominant activity", "new construction"],
          ]}
        />
      </Win>

      <Win title="primary transition" x={1160} y={400} w={640} h={190} delay={58}>
        <div style={{ padding: "24px 22px 0", fontSize: 42, fontWeight: 500, display: "flex", alignItems: "center", whiteSpace: "nowrap" }}>
          <Sw color={CLASSES[0][1]} size={28} />
          ground -&gt;&nbsp;
          <Sw color={CLASSES[4][1]} size={28} />
          buildings
        </div>
        <div style={{ padding: "10px 22px", fontSize: 22 }}>40.45% of the frame</div>
      </Win>

      <Win title="legend" x={1100} y={632} w={430} h={300} delay={84}>
        <div style={{ padding: "14px 18px", display: "grid", gap: 9, fontSize: 21 }}>
          {CLASSES.map(([name, color]) => (
            <div key={name}>
              <Sw color={color} />
              {name}
            </div>
          ))}
        </div>
      </Win>

      <div style={{ position: "absolute", left: 1580, top: 690, width: 250, fontSize: 22, lineHeight: 1.4, color: C.ink }}>
        {frame > 100 && "coloured by what the land became."}
      </div>

      <Cursor
        path={[
          [0, 1300, 760],
          [50, 1420, 470],
          [100, 1300, 520],
          [165, 1250, 560],
        ]}
      />
    </Paper>
  );
}
