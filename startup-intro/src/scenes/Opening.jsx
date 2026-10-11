// Scene 1, white: the mark fades in with a small scale-up and splits into its two frames; the name
// arrives with the first word of the voice (`cue`).
import { C } from "../theme";
import { FadeUp, Logo, Page, useIn } from "../ui";

export function Opening({ cue }) {
  const p = useIn(0, 30);
  const split = useIn(10, 40);
  return (
    <Page>
      <div style={{ opacity: p, transform: `scale(${0.9 + 0.1 * p})`, marginBottom: 56 }}>
        <Logo size={148} split={split} />
      </div>
      <FadeUp start={cue - 4} style={{ fontSize: 84, fontWeight: 600, letterSpacing: "-0.025em" }}>
        Introducing <span style={{ color: C.accent }}>Change Lens.</span>
      </FadeUp>
    </Page>
  );
}
