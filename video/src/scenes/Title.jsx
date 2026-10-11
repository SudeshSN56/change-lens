// 6.5-11.5 s: the name types on, "lens" gets selected, then the question the tool answers.
import { useCurrentFrame } from "remotion";
import { C } from "../theme";
import { Paper, Rows, Selected, Typed, Win } from "../ui";

export function Title() {
  const frame = useCurrentFrame();
  return (
    <Paper>
      <div style={{ position: "absolute", left: 150, top: 200, fontSize: 210, fontWeight: 500, letterSpacing: "-0.02em", lineHeight: 1 }}>
        {frame < 48 ? (
          <Typed text="change lens" start={4} cps={16} />
        ) : (
          <span>
            change <Selected start={50} dur={10}>lens</Selected>
          </span>
        )}
      </div>
      <div style={{ position: "absolute", left: 158, top: 520, display: "grid", gap: 14, fontSize: 50 }}>
        <Typed text="742 aerial tile pairs." start={70} cps={40} caret={frame < 92} />
        {frame >= 92 && <Typed text="two dates." start={92} cps={30} caret={frame < 108} />}
        {frame >= 108 && <Typed text="what changed?" start={108} cps={30} caretColor={C.blue} />}
      </div>
      <Win title="sectors" x={1380} y={560} w={380} h={190} delay={84}>
        <Rows
          rows={[
            ["hangzhou", "258 tiles"],
            ["chengdu", "249 tiles"],
            ["shanghai", "235 tiles"],
          ]}
        />
      </Win>
    </Paper>
  );
}
