// 0-3 s: the ASCII lens prints in, the cursor finds the app icon and clicks it.
import { interpolate, useCurrentFrame } from "remotion";
import { AppIcon, AsciiLens, Cursor, Paper } from "../ui";

export function Open() {
  const frame = useCurrentFrame();
  const press = interpolate(frame, [60, 64, 72, 90], [1, 0.9, 1.08, 1.6], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <Paper>
      <AsciiLens x={960} y={540} reveal={interpolate(frame, [0, 55], [0, 1], { extrapolateRight: "clamp" })} />
      <AppIcon x={960} y={540} scale={press} />
      <Cursor
        path={[
          [0, 1560, 940],
          [52, 972, 552],
          [90, 980, 560],
        ]}
        clicks={[60]}
      />
    </Paper>
  );
}
