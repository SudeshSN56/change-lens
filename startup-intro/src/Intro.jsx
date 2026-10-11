// Scene order, timing and the mix. The narration is one continuous read (timings.json, written by
// gen_voice.py): after a short lead on the logo, line i starts as soon as line i-1 and its breath end.
// A scene covers one or more lines and lasts exactly as long as they do, so the voice never waits.
import { AbsoluteFill, Html5Audio, interpolate, Sequence, Series, staticFile } from "remotion";
import timings from "../timings.json";
import { Ask } from "./scenes/Ask";
import { End } from "./scenes/End";
import { Explorer } from "./scenes/Explorer";
import { Headline } from "./scenes/Headline";
import { Opening } from "./scenes/Opening";
import { Overview } from "./scenes/Overview";
import { Scale } from "./scenes/Scale";
import { Similar } from "./scenes/Similar";
import { Tile } from "./scenes/Tile";
import { Upload } from "./scenes/Upload";
import { FPS } from "./theme";

// [scene, number of script lines it covers]
const SCENES = [
  [Opening, 1],
  [Headline, 1],
  [Overview, 1],
  [Ask, 1],
  [Explorer, 1],
  [Tile, 2], // compare, then change map: one window across two lines
  [Similar, 1],
  [Upload, 1],
  [Scale, 1],
  [End, 1],
];

const LINES = timings.lines;
if (SCENES.reduce((n, [, c]) => n + c, 0) !== LINES.length) {
  throw new Error(`Intro.jsx covers a different number of lines than timings.json (${LINES.length}): rerun gen_voice.py or fix SCENES`);
}
const LEAD = Math.round(timings.lead * FPS);
const LEN = LINES.map((l) => Math.round(l.length * FPS));
const VO = LINES.map((l) => Math.round(l.duration * FPS));
const AT = LEN.map((_, i) => LEAD + LEN.slice(0, i).reduce((a, b) => a + b, 0)); // absolute start of each line
export const DURATION = LEAD + LEN.reduce((a, b) => a + b, 0);

let first = 0;
const PLAN = SCENES.map(([Scene, count]) => {
  const ids = Array.from({ length: count }, (_, k) => first + k);
  first += count;
  const start = ids[0] === 0 ? 0 : AT[ids[0]];
  const end = ids.at(-1) === LINES.length - 1 ? DURATION : AT[ids.at(-1) + 1];
  // cues: where each of the scene's lines starts, in frames from the scene's own start
  return { Scene, start, len: end - start, cues: ids.map((i) => AT[i] - start), vos: ids.map((i) => VO[i]) };
});
const DARK = PLAN.find((p) => p.Scene === Tile);

export function Intro() {
  return (
    <AbsoluteFill>
      <Series>
        {PLAN.map(({ Scene, len, cues, vos }, k) => (
          <Series.Sequence key={k} durationInFrames={len}>
            <Scene len={len} cues={cues} vos={vos} cue={cues[0]} vo={vos[0]} />
          </Series.Sequence>
        ))}
      </Series>

      {LINES.map((l, i) => (
        <Sequence key={l.file} from={AT[i]} layout="none">
          <Html5Audio src={staticFile(`audio/${l.file}`)} />
        </Sequence>
      ))}
      <Html5Audio
        src={staticFile("audio/music.wav")}
        volume={(f) => 0.16 * interpolate(f, [0, 30, DURATION - 100, DURATION], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}
      />
      {/* quiet whoosh peaking on the cuts into and out of the dark scene */}
      {[DARK.start, DARK.start + DARK.len].map((at) => (
        <Sequence key={at} from={at - 18} durationInFrames={42} layout="none">
          <Html5Audio src={staticFile("audio/whoosh.wav")} volume={0.3} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
