// Look of the intro: minimalist SaaS ad. White text scenes, one near-black product scene, one accent.
import { loadFont } from "@remotion/google-fonts/Inter";

export const SANS = loadFont("normal", { weights: ["400", "500", "600", "700"], subsets: ["latin"] }).fontFamily;

export const C = {
  white: "#FFFFFF",
  dark: "#080808",
  text: "#171717",
  muted: "#6B7280",
  panel: "#F3F4F6",
  line: "#E5E7EB",
  accent: "#3B6FD8",
  // product window on the dark scene
  win: "#111214",
  winLine: "#26282C",
  winText: "#ECECEE",
  winMuted: "#8B8E96",
};

// Land-cover classes, same colours as frontend/src/lib/constants.js.
export const CLASS_COLOR = {
  "non-vegetated ground": "#808080",
  tree: "#00ff00",
  "low vegetation": "#008000",
  water: "#0000ff",
  buildings: "#800000",
  playgrounds: "#ff0000",
};

// Change levels by share of frame changed, same cut-offs and colours as frontend/src/lib/constants.js.
export const LEVELS = [
  { label: "Severe", min: 40, color: "#d03b3b" },
  { label: "High", min: 25, color: "#ec835a" },
  { label: "Moderate", min: 10, color: "#fab219" },
  { label: "Low", min: 0, color: "#7d8a99" },
];
export const levelOf = (pct) => LEVELS.find((l) => pct >= l.min);

export const FPS = 60;
export const W = 1920;
export const H = 1080;

// Typing speed shared by <Typed> and public/audio/type.wav (gen_audio.py clicks at the same rate).
export const CPS = 22; // about the voice's speaking rate, so typed lines finish with the spoken ones
// Every eased move in the film uses this curve: fast start, long soft settle.
export const EASE = [0.16, 1, 0.3, 1];
