// Scene 2, white: the opening line types on, key phrase in the accent; the second half of the spoken
// line lands underneath as the voice reaches it.
import { C } from "../theme";
import { FadeUp, Page, Typed } from "../ui";

export function Headline({ vo }) {
  return (
    <Page>
      <div style={{ fontSize: 92, fontWeight: 600, letterSpacing: "-0.03em" }}>
        <Typed parts={[["See "], ["what changed", C.accent], [" on the ground."]]} start={6} />
      </div>
      <FadeUp start={Math.round(vo * 0.56)} style={{ fontSize: 44, color: C.muted, marginTop: 22 }}>
        Between two aerial images.
      </FadeUp>
    </Page>
  );
}
