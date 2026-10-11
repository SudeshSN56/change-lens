import { Composition } from "remotion";
import { DURATION, Intro } from "./Intro";
import { FPS, H, W } from "./theme";

export function Root() {
  return <Composition id="StartupIntro" component={Intro} durationInFrames={DURATION} fps={FPS} width={W} height={H} />;
}
