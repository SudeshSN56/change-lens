// Building blocks shared by the scenes: page, ease-out reveals, slow push, typing with sound, the logo,
// and the light app pieces (panel, tile overlay, level badge, button press with its click).
import { AbsoluteFill, Easing, Html5Audio, Img, interpolate, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { C, CPS, EASE, levelOf, SANS } from "./theme";

const ease = Easing.bezier(...EASE);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" };

/** 0 -> 1 from frame `start` over `dur` frames, on the film's ease-out curve. */
export function useIn(start = 0, dur = 30) {
  return interpolate(useCurrentFrame(), [start, start + dur], [0, 1], { ...clamp, easing: ease });
}

export function Page({ dark = false, children }) {
  return (
    <AbsoluteFill
      style={{
        background: dark ? C.dark : C.white, color: dark ? C.winText : C.text, fontFamily: SANS,
        alignItems: "center", justifyContent: "center", overflow: "hidden",
      }}
    >
      {children}
    </AbsoluteFill>
  );
}

/** Text and small elements: opacity 0 -> 1 with an upward move of `rise` px (15 for text, 25-40 for cards). */
export function FadeUp({ start = 0, dur = 30, rise = 15, style, children }) {
  const p = useIn(start, dur);
  return <div style={{ ...style, opacity: p, transform: `translateY(${(1 - p) * rise}px)` }}>{children}</div>;
}

/** Interfaces: opacity plus a 96% -> 100% scale. */
export function ScaleIn({ start = 0, dur = 36, from = 0.96, style, children }) {
  const p = useIn(start, dur);
  return <div style={{ ...style, opacity: p, transform: `scale(${from + (1 - from) * p})` }}>{children}</div>;
}

/** Slow camera push across the whole scene: scale 1 -> 1 + amount over `len` frames. */
export function Push({ len, amount = 0.03, children }) {
  const s = 1 + amount * interpolate(useCurrentFrame(), [0, len], [0, 1], clamp);
  return <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", transform: `scale(${s})` }}>{children}</AbsoluteFill>;
}

/** Frames needed to type `text` at CPS. */
export const typeFrames = (text, fps) => Math.ceil((text.length * fps) / CPS);

/**
 * Text that types on from `start` with a blinking cursor and key clicks. `parts` is [[text, color?], ...]
 * so a key phrase can carry the accent. The untyped rest is laid out but transparent, so centred
 * lines do not shift while they type.
 */
export function Typed({ parts, start = 0, cursor = true, sound = true }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const text = parts.map(([t]) => t).join("");
  // Character k appears at start + k / CPS seconds, the same moment type.wav has its k-th click.
  const n = frame < start ? 0 : Math.min(text.length, Math.floor(((frame - start) * CPS) / fps) + 1);
  const typing = frame >= start && n < text.length;
  const on = cursor && (typing || Math.floor(frame / 30) % 2 === 0); // blink: 0.5 s on, 0.5 s off
  let left = n;
  const shown = [];
  const rest = [];
  parts.forEach(([t, color], i) => {
    const k = Math.max(0, Math.min(t.length, left));
    left -= t.length;
    shown.push(<span key={i} style={{ color }}>{t.slice(0, k)}</span>);
    rest.push(<span key={i}>{t.slice(k)}</span>);
  });
  return (
    <span style={{ whiteSpace: "pre" }}>
      {shown}
      <span
        style={{
          display: "inline-block", width: "0.055em", height: "0.92em", margin: "0 -0.0275em", verticalAlign: "-0.1em",
          background: on ? C.accent : "transparent",
        }}
      />
      <span style={{ color: "transparent" }}>{rest}</span>
      {sound && (
        <Sequence from={start} durationInFrames={typeFrames(text, fps)} layout="none">
          <Html5Audio src={staticFile("audio/type.wav")} volume={0.32} />
        </Sequence>
      )}
    </span>
  );
}

/**
 * The Change Lens mark (frontend/public/favicon.svg): two offset frames, before and after, on a dark tile.
 * `split` 0 stacks the frames into one square, 1 offsets them as in the favicon.
 */
export function Logo({ size = 120, split = 1 }) {
  const a = 10 - 3 * split; // outline frame x/y
  const b = 10 + 3 * split; // filled frame x/y
  const o = 12 - 6 * split; // overlap width
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" style={{ display: "block", borderRadius: size * 0.22, boxShadow: "0 18px 40px rgba(17,24,39,0.18)" }}>
      {/* same paint order as the favicon: the filled frame covers the outline, the overlap sits on top */}
      <rect width="32" height="32" rx="7" fill={C.text} />
      <rect x={a} y={a} width="12" height="12" rx="1" fill="none" stroke="#FFFFFF" strokeWidth="2" />
      <rect x={b} y={b} width="12" height="12" rx="1" fill={C.accent} />
      <rect x={b} y={b} width={o} height={o} fill="#9DB7EC" />
    </svg>
  );
}

export const SHADOW = "0 1px 2px rgba(16,24,40,0.04), 0 12px 32px rgba(16,24,40,0.07)";

/** Light app panel: white card, hairline border, soft shadow, optional title and subtitle. */
export function Panel({ title, sub, style, children }) {
  return (
    <div style={{ background: C.white, border: `1px solid ${C.line}`, borderRadius: 18, boxShadow: SHADOW, padding: "26px 30px", ...style }}>
      {title && <div style={{ fontSize: 23, fontWeight: 600 }}>{title}</div>}
      {sub && <div style={{ fontSize: 17, color: C.muted, marginTop: 4 }}>{sub}</div>}
      {children}
    </div>
  );
}

// Overlay PNGs (data/analyzed/overlays) have a legend baked in at the bottom left whose top sits at y >= ~400
// of 512 (six classes); scaling 1.3x from the top pushes it out of the frame.
export const LEGEND_CROP = { transform: "scale(1.3)", transformOrigin: "top center" };

/** A tile overlay, cropped so its legend falls outside. */
export function Overlay({ src, size, radius = 10, style }) {
  return (
    <div style={{ width: size, height: size, borderRadius: radius, overflow: "hidden", flex: "none", ...style }}>
      <Img src={staticFile(src)} style={{ width: "100%", height: "100%", ...LEGEND_CROP }} />
    </div>
  );
}

/** Change level of a tile, as the app's badge: coloured dot and label. */
export function LevelBadge({ pct, size = 18 }) {
  const l = levelOf(pct);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: size, fontWeight: 500 }}>
      <span style={{ width: 9, height: 9, borderRadius: "50%", background: l.color }} />
      {l.label}
    </span>
  );
}

/** Number counting up to `to` from frame `start`. */
export const useCount = (to, start = 0, dur = 40) => to * useIn(start, dur);

/** A button press at frame `at`: the scale to apply (dips, then comes back). Pair it with <Click at={at} />. */
export function usePress(at) {
  return 1 - 0.07 * (useIn(at, 5) - useIn(at + 5, 10));
}

/** UI click sound at frame `at`. */
export function Click({ at, volume = 0.5 }) {
  return (
    <Sequence from={at} durationInFrames={20} layout="none">
      <Html5Audio src={staticFile("audio/click.wav")} volume={volume} />
    </Sequence>
  );
}

// Short class names, as the app's transition chips show them.
export const SHORT = { "non-vegetated ground": "Ground", tree: "Tree", "low vegetation": "Low veg", water: "Water", buildings: "Buildings", playgrounds: "Playgrounds" };
