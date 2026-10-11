// Scene order and timing (30 fps, 1350 frames = 45 s). Pixel wipes sit on the cuts, as in the reference.
import { AbsoluteFill, Series } from "remotion";
import { PixelWipe } from "./ui";
import { BeforeAfter } from "./scenes/BeforeAfter";
import { ChangeMap } from "./scenes/ChangeMap";
import { End } from "./scenes/End";
import { Introducing } from "./scenes/Introducing";
import { Numbers } from "./scenes/Numbers";
import { Open } from "./scenes/Open";
import { Product } from "./scenes/Product";
import { Query } from "./scenes/Query";
import { Title } from "./scenes/Title";

const SCENES = [
  [Open, 90],
  [Introducing, 105],
  [Title, 150],
  [BeforeAfter, 195],
  [ChangeMap, 165],
  [Query, 210],
  [Numbers, 150],
  [Product, 150],
  [End, 135],
];
export const DURATION = SCENES.reduce((s, [, d]) => s + d, 0);

// Cut frames that get a pixel wipe: into the title, the tile, the query, in and out of the dark beat, the end.
const CUTS = [3, 4, 6, 7, 8, 9].map((n) => SCENES.slice(0, n - 1).reduce((s, [, d]) => s + d, 0));

export function Intro() {
  return (
    <AbsoluteFill>
      <Series>
        {SCENES.map(([Scene, d], i) => (
          <Series.Sequence key={i} durationInFrames={d}>
            <Scene />
          </Series.Sequence>
        ))}
      </Series>
      {CUTS.map((at) => (
        <PixelWipe key={at} at={at} seed={`cut-${at}`} />
      ))}
    </AbsoluteFill>
  );
}
