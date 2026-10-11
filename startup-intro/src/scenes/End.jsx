// Last scene, white: the mark returns with the wordmark as the voice says the name, the tagline lands with
// "Know what changed", then the address. Everything is still for the last 1.5 s.
import { Html5Audio, interpolate, Sequence, staticFile } from "remotion";
import { C } from "../theme";
import { FadeUp, Logo, Page, useIn } from "../ui";

export function End({ len, vo }) {
  const p = useIn(0, 30);
  const split = useIn(10, 40);
  const tag = Math.round(vo * 0.48); // the second sentence of the line
  return (
    <Page>
      <div style={{ display: "flex", alignItems: "center", gap: 30, opacity: p, transform: `scale(${0.94 + 0.06 * p})` }}>
        <Logo size={112} split={split} />
        <span style={{ fontSize: 96, fontWeight: 600, letterSpacing: "-0.035em" }}>Change Lens</span>
      </div>
      <FadeUp start={tag} style={{ fontSize: 44, fontWeight: 500, letterSpacing: "-0.02em", marginTop: 40 }}>
        Know what changed.
      </FadeUp>
      <FadeUp start={tag + 12} style={{ fontSize: 28, color: C.muted, marginTop: 18 }}>
        github.com/SudeshSN56/change-lens
      </FadeUp>
      <Sequence from={4} layout="none">
        {/* the bell is still ringing when the film ends: fade it out instead of cutting it */}
        <Html5Audio
          src={staticFile("audio/tone.wav")}
          volume={(f) => 0.22 * interpolate(f, [len - 100, len - 10], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}
        />
      </Sequence>
    </Page>
  );
}
