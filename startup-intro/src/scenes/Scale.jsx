// Scene 6, white: everything in the index is searchable, accent on one phrase.
import { C } from "../theme";
import { FadeUp, Page } from "../ui";

export function Scale({ vo }) {
  return (
    <Page>
      <FadeUp style={{ fontSize: 120, fontWeight: 700, letterSpacing: "-0.04em" }}>Everything.</FadeUp>
      {/* "searchable in seconds" starts about 35% into the line */}
      <FadeUp start={Math.round(vo * 0.35)} style={{ fontSize: 64, fontWeight: 500, letterSpacing: "-0.025em", marginTop: 10 }}>
        Searchable <span style={{ color: C.accent }}>in seconds.</span>
      </FadeUp>
    </Page>
  );
}
