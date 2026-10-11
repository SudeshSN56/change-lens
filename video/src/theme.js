// Look of the film, measured from the Paper Mono reference (paper, ink, periwinkle blue)
// and set in the app's own fonts.
import { loadFont as loadMono } from "@remotion/google-fonts/FiraCode";
import { loadFont as loadSans } from "@remotion/google-fonts/FiraSans";

export const MONO = loadMono("normal", { weights: ["300", "400", "500", "600", "700"], subsets: ["latin"] }).fontFamily;
export const SANS = loadSans("normal", { weights: ["400", "500", "600"], subsets: ["latin"] }).fontFamily;

export const C = {
  paper: "#F2F1EC",
  ink: "#1E1E1E",
  blue: "#78A8E8",
  blueLine: "#8DB0EC",
  blueSoft: "#C5D6F2",
  win: "#F8F8F4",
  dark: "#111111",
  darkWin: "#171717",
  light: "#EDEDED",
};

// Land-cover classes, same colours as frontend/src/lib/constants.js.
export const CLASSES = [
  ["non-vegetated ground", "#808080"],
  ["tree", "#00ff00"],
  ["low vegetation", "#008000"],
  ["water", "#0000ff"],
  ["buildings", "#800000"],
  ["playgrounds", "#ff0000"],
];

export const FPS = 30;
export const W = 1920;
export const H = 1080;
