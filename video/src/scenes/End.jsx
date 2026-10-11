// 40.5-45 s: end card, then the words erase back to the icon and the ASCII lens (bookends the open).
import { interpolate, useCurrentFrame } from "remotion";
import { AppIcon, AsciiLens, Paper, Selected, Typed, untype } from "../ui";

export function End() {
  const frame = useCurrentFrame();
  const erasing = frame >= 92;
  const icon = interpolate(frame, [112, 122], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <Paper>
      <AsciiLens x={erasing ? 960 : 1420} y={540} reveal={1} opacity={erasing ? 0.9 : 0.75} />
      <div style={{ position: "absolute", left: 140, top: 150, fontSize: 230, fontWeight: 500, lineHeight: 1, letterSpacing: "-0.02em" }}>
        <div>{erasing ? untype("change", frame, 92, 104) : "change"}</div>
        <div style={{ marginLeft: 140 }}>{erasing ? untype("lens", frame, 96, 106) : "lens"}</div>
      </div>
      <div style={{ position: "absolute", left: 150, top: 720, fontSize: 52, fontWeight: 500, lineHeight: 1.35 }}>
        {erasing ? (
          <div>{untype("semantic change detection", frame, 92, 108)}</div>
        ) : (
          <div>
            <Typed text="semantic change detection" start={10} cps={40} caret={false} />
          </div>
        )}
        {!erasing && frame >= 34 && (
          <div>
            <Selected start={36} dur={12}>ask what changed.</Selected>
          </div>
        )}
      </div>
      {icon > 0 && <AppIcon x={960} y={540} scale={icon} />}
    </Paper>
  );
}
