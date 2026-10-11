// 30.5-35.5 s: dark segment (the reference's code/mixer beat): test-set scores from weights/final_metrics.json.
import { interpolate, useCurrentFrame } from "remotion";
import { C } from "../theme";
import { Paper, Selected, Typed, Win } from "../ui";

// final_metrics.json -> "tuned" (threshold 0.55 + flip TTA), test split.
const PER_CLASS = [
  ["ground", 0.73],
  ["tree", 0.486],
  ["low veg", 0.618],
  ["water", 0.643],
  ["buildings", 0.851],
  ["playgr.", 0.726],
];
const HEADLINE = [
  ["SeK", 0.192],
  ["change IoU", 0.544],
  ["precision", 0.738],
  ["recall", 0.674],
];

const grow = (frame, start) => interpolate(frame, [start, start + 30], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

export function Numbers() {
  const frame = useCurrentFrame();
  const barH = 420;
  return (
    <Paper dark>
      <div style={{ position: "absolute", left: 140, top: 80, fontSize: 30, color: "#9a9a9a" }}>
        <Typed text="model: siamese resnet-34 u-net" start={2} cps={40} caretColor={C.blue} />
      </div>

      <Win title="per-class IoU · test" x={140} y={170} w={860} h={700} dark delay={16}>
        <div style={{ position: "absolute", left: 40, right: 40, top: 60, height: barH, display: "flex", alignItems: "flex-end", gap: 40 }}>
          {PER_CLASS.map(([name, v], i) => {
            const g = grow(frame, 24 + i * 5);
            return (
              <div key={name} style={{ flex: 1, height: "100%", position: "relative", borderLeft: `1px dashed #33405a` }}>
                <div style={{ position: "absolute", bottom: 0, left: 8, right: 8, height: barH * v * g, background: C.blue }} />
                <div style={{ position: "absolute", bottom: barH * v * g + 10, left: 8, fontSize: 22, color: C.light }}>{(v * g).toFixed(3)}</div>
              </div>
            );
          })}
        </div>
        <div style={{ position: "absolute", left: 40, right: 40, top: 60 + barH + 18, display: "flex", gap: 40, fontSize: 20, color: "#9a9a9a" }}>
          {PER_CLASS.map(([name]) => (
            <div key={name} style={{ flex: 1, paddingLeft: 8 }}>
              {name}
            </div>
          ))}
        </div>
      </Win>

      <div style={{ position: "absolute", left: 1100, top: 170, display: "grid", gap: 26 }}>
        {HEADLINE.map(([label, v], i) => {
          const g = grow(frame, 40 + i * 8);
          return (
            <div key={label} style={{ opacity: g > 0 ? 1 : 0 }}>
              <div style={{ fontSize: 24, color: "#9a9a9a" }}>{label}</div>
              <div style={{ fontSize: 96, fontWeight: 500, lineHeight: 1, color: i === 0 ? C.blue : C.light }}>{(v * g).toFixed(3)}</div>
            </div>
          );
        })}
      </div>

      <div style={{ position: "absolute", left: 140, top: 930, fontSize: 30, color: C.light }}>
        {frame >= 90 && (
          <Selected start={92} dur={12} style={{ color: C.ink }}>
            scored on 742 held-out tile pairs it never trained on
          </Selected>
        )}
      </div>
    </Paper>
  );
}
