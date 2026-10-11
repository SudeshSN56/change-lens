// Building blocks shared by the scenes: paper, design-tool windows, cursor, typing, ASCII lens, pixel wipe.
import { AbsoluteFill, Easing, interpolate, random, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { ASCII } from "./ascii";
import { C, MONO } from "./theme";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" };

export function Paper({ children, dark = false, grid = false }) {
  return (
    <AbsoluteFill
      style={{
        background: dark ? C.dark : C.paper,
        color: dark ? C.light : C.ink,
        fontFamily: MONO, // Fira Code's ligatures turn "->" into an arrow
        backgroundImage: grid
          ? `linear-gradient(${C.blueSoft}66 1px, transparent 1px), linear-gradient(90deg, ${C.blueSoft}66 1px, transparent 1px)`
          : undefined,
        backgroundSize: grid ? "48px 48px" : undefined,
        overflow: "hidden",
      }}
    >
      {children}
    </AbsoluteFill>
  );
}

/** Quick pop-in used for windows and chips: 0 -> 1 over ~10 frames from `delay`. */
export function usePop(delay = 0) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping: 200, mass: 0.5 }, durationInFrames: 10 });
}

/** A design-tool window: blue frame, solid offset shadow, title bar with a close mark. */
/** `pop={false}` shows the window at once, for a window that carries over a cut. */
export function Win({ title, x, y, w, h, delay = 0, pop = true, dark = false, children, bodyStyle }) {
  const frame = useCurrentFrame();
  const popped = usePop(delay);
  const p = pop ? popped : 1;
  if (frame < delay) return null;
  return (
    <div
      style={{
        position: "absolute", left: x, top: y, width: w, height: h, display: "flex", flexDirection: "column",
        background: dark ? C.darkWin : C.win, border: `2px solid ${C.blueLine}`, boxShadow: `6px 6px 0 ${dark ? "#2B4570" : C.blueSoft}`,
        opacity: p, transform: `scale(${0.95 + 0.05 * p})`, transformOrigin: "top left",
      }}
    >
      <div
        style={{
          height: 40, flex: "none", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 14px",
          borderBottom: `1.5px solid ${C.blueLine}`, font: `500 17px ${MONO}`, color: dark ? C.light : C.ink,
        }}
      >
        <span>{title}</span>
        <span style={{ fontSize: 20 }}>×</span>
      </div>
      <div style={{ position: "relative", flex: 1, overflow: "hidden", ...bodyStyle }}>{children}</div>
    </div>
  );
}

/** Label / value rows inside a window, like the reference's METRICS / UNITS panel. */
export function Rows({ rows, size = 20, dark = false }) {
  return (
    <div style={{ padding: "14px 18px", display: "grid", gap: 8, font: `400 ${size}px ${MONO}`, color: dark ? C.light : C.ink }}>
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 24 }}>
          <span>{k}</span>
          <span>{v}</span>
        </div>
      ))}
    </div>
  );
}

/** Text that types on at `cps` characters per second, with a caret. */
export function Typed({ text, start = 0, cps = 22, caret = true, caretColor = C.ink, style }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const n = Math.max(0, Math.min(text.length, Math.floor(((frame - start) * cps) / fps)));
  const typing = frame >= start && n < text.length;
  const on = caret && frame >= start && (typing || Math.floor(frame / 15) % 2 === 0);
  return (
    <span style={style}>
      {text.slice(0, n)}
      <span
        style={{
          display: "inline-block", width: "0.07em", height: "0.95em", marginLeft: "0.06em", verticalAlign: "-0.12em",
          background: on ? caretColor : "transparent",
        }}
      />
    </span>
  );
}

/** Text erased back to empty between `from` and `to` (the reference's closing move). */
export function untype(text, frame, from, to) {
  const keep = Math.round(interpolate(frame, [from, to], [text.length, 0], clamp));
  return text.slice(0, keep);
}

/** Blue text-selection box that sweeps across its text, like the reference's highlighted URL. */
export function Selected({ children, start = 0, dur = 10, style }) {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [start, start + dur], [0, 100], { ...clamp, easing: Easing.out(Easing.cubic) });
  return (
    <span
      style={{
        backgroundImage: `linear-gradient(${C.blue}, ${C.blue})`, backgroundRepeat: "no-repeat",
        backgroundSize: `${p}% 100%`, padding: "0 0.12em", ...style,
      }}
    >
      {children}
    </span>
  );
}

/** Pointer that follows keyframes [[frame, x, y], ...] and dips on each click frame. */
export function Cursor({ path, clicks = [] }) {
  const frame = useCurrentFrame();
  const opt = { ...clamp, easing: Easing.inOut(Easing.cubic) };
  const x = interpolate(frame, path.map((p) => p[0]), path.map((p) => p[1]), opt);
  const y = interpolate(frame, path.map((p) => p[0]), path.map((p) => p[2]), opt);
  const down = clicks.some((c) => frame >= c && frame < c + 6);
  return (
    <svg
      width="30" height="40" viewBox="0 0 20 27"
      style={{ position: "absolute", left: x, top: y, zIndex: 50, transform: `scale(${down ? 0.82 : 1})`, transformOrigin: "top left" }}
    >
      <path d="M1 1 L1 21 L6.2 16.2 L9.6 24.6 L13.2 23.1 L9.8 14.9 L16.6 14.9 Z" fill={C.ink} stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

/** Faint ASCII render of tile 02353, cut to a lens circle; rows print in as `reveal` goes 0 -> 1. */
export function AsciiLens({ x, y, size = 24, reveal = 1, color = "#B4CAF0", opacity = 1 }) {
  const rows = ASCII.length;
  return (
    <div
      style={{
        position: "absolute", left: x, top: y, transform: "translate(-50%, -50%)", whiteSpace: "pre", opacity,
        font: `400 ${size}px/${Math.round(size * 1.12)}px ${MONO}`, fontVariantLigatures: "none", color,
      }}
    >
      {ASCII.map((line, i) => {
        const t = Math.max(0, Math.min(1, reveal * 1.6 - (i / rows) * 0.6));
        return <div key={i}>{line.slice(0, Math.round(line.length * t)) || " "}</div>;
      })}
    </div>
  );
}

/** App mark: the radar icon from the frontend, in a blue double frame. */
export function AppIcon({ x, y, size = 96, scale = 1 }) {
  return (
    <div
      style={{
        position: "absolute", left: x, top: y, width: size, height: size, transform: `translate(-50%, -50%) scale(${scale})`,
        display: "grid", placeItems: "center", background: C.win, border: `2px solid ${C.blueLine}`, boxShadow: `5px 5px 0 ${C.blue}`,
      }}
    >
      <svg width={size * 0.58} height={size * 0.58} viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="1.8" strokeLinecap="round">
        <path d="M12 3a9 9 0 1 0 9 9M12 7a5 5 0 1 0 5 5M12 12l7-7" />
      </svg>
    </div>
  );
}

/** Blue pixel blocks that flood in and drain out around a cut at `at` (the reference's dither transition). */
export function PixelWipe({ at, dur = 18, cell = 60, seed = "w" }) {
  const frame = useCurrentFrame();
  const t = (frame - (at - dur / 2)) / dur;
  if (t <= 0 || t >= 1) return null;
  const cover = Math.sin(Math.PI * t) * 1.05; // 0 -> full -> 0
  const cols = Math.ceil(1920 / cell);
  const rows = Math.ceil(1080 / cell);
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const k = `${seed}-${r}-${c}`;
      if (random(k) > cover) continue;
      cells.push(
        <div
          key={k}
          style={{
            position: "absolute", left: c * cell, top: r * cell, width: cell, height: cell,
            background: random(`${k}-c`) > 0.45 ? C.blue : C.blueSoft,
          }}
        />,
      );
    }
  }
  return <AbsoluteFill style={{ zIndex: 100 }}>{cells}</AbsoluteFill>;
}
