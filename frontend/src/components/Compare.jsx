import { useEffect, useRef, useState } from "react";
import { media } from "../lib/constants";
import { Segmented } from "./ui";

const LAYERS = { ba: ["before", "after"], bm: ["before", "map"], am: ["after", "map"] };

/** Before / after / change-map viewer: swipe, flicker, or side by side, with a magnifier. */
export function Compare({ rec }) {
  const [mode, setMode] = useState("swipe");
  const [layers, setLayers] = useState("ba");
  const [pos, setPos] = useState(50);
  const [flip, setFlip] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [magnify, setMagnify] = useState(false);
  const [zoom, setZoom] = useState(null);
  const box = useRef(null);
  const dragging = useRef(false);

  const m = rec.metadata ?? {};
  const src = { before: media(rec.image1), after: media(rec.image2), map: media(rec.overlay) };
  const caption = {
    before: `Before${m.date_before ? ` · ${m.date_before}` : ""}`,
    after: `After${m.date_after ? ` · ${m.date_after}` : ""}`,
    map: "Change map",
  };
  const [left, right] = LAYERS[layers];

  useEffect(() => {
    if (mode !== "flicker" || !playing) return undefined;
    const t = setInterval(() => setFlip((v) => !v), 700);
    return () => clearInterval(t);
  }, [mode, playing]);

  const relative = (e) => {
    const r = box.current.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 };
  };
  const imgStyle =
    magnify && zoom ? { transform: "scale(2.6)", transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined;

  const onKey = (e) => {
    const step = e.shiftKey ? 10 : 2;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setPos((p) => Math.max(0, p - step));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setPos((p) => Math.min(100, p + step));
    }
  };

  const help = {
    swipe: "Drag across the image, or focus the handle and use ← → (Shift for larger steps).",
    flicker: "Alternates the two layers so change pops out. Click the image to pause and step.",
    grid: "Before, after and the change map, coloured by what the land became.",
  }[mode];

  return (
    <div className="compare">
      <div className="compare-bar no-print">
        <Segmented
          size="sm"
          label="Viewer mode"
          value={mode}
          onChange={setMode}
          options={[
            { value: "swipe", label: "Swipe" },
            { value: "flicker", label: "Flicker" },
            { value: "grid", label: "Side by side" },
          ]}
        />
        {mode !== "grid" && (
          <Segmented
            size="sm"
            label="Layers"
            value={layers}
            onChange={setLayers}
            options={[
              { value: "ba", label: "Before / After" },
              { value: "bm", label: "Before / Map" },
              { value: "am", label: "After / Map" },
            ]}
          />
        )}
        {mode === "flicker" && (
          <button type="button" className="btn sm" onClick={() => setPlaying((p) => !p)}>
            {playing ? "Pause" : "Play"}
          </button>
        )}
        {mode !== "grid" && (
          <button
            type="button"
            className={magnify ? "btn sm on" : "btn sm"}
            aria-pressed={magnify}
            onClick={() => {
              setMagnify((v) => !v);
              setZoom(null);
            }}
          >
            Magnify ×2.6
          </button>
        )}
      </div>

      {mode === "grid" ? (
        <div className="triptych">
          {["before", "after", "map"].map((k) => (
            <figure key={k}>
              <img src={src[k]} alt={caption[k]} />
              <figcaption>{caption[k]}</figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <div
          ref={box}
          className={`stage ${mode}${magnify ? " magnify" : ""}`}
          onPointerDown={(e) => {
            if (mode === "swipe") {
              dragging.current = true;
              e.currentTarget.setPointerCapture(e.pointerId);
              setPos(Math.max(0, Math.min(100, relative(e).x)));
            } else {
              setPlaying(false);
              setFlip((v) => !v);
            }
          }}
          onPointerMove={(e) => {
            if (magnify) setZoom(relative(e));
            if (dragging.current) setPos(Math.max(0, Math.min(100, relative(e).x)));
          }}
          onPointerUp={() => {
            dragging.current = false;
          }}
          onPointerLeave={() => setZoom(null)}
        >
          {mode === "swipe" ? (
            <>
              <div className="stage-layer">
                <img src={src[right]} alt={caption[right]} style={imgStyle} draggable={false} />
              </div>
              <div className="stage-layer" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
                <img src={src[left]} alt={caption[left]} style={imgStyle} draggable={false} />
              </div>
              <div
                className="stage-handle"
                style={{ left: `${pos}%` }}
                role="slider"
                tabIndex={0}
                aria-label="Swipe position"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(pos)}
                onKeyDown={onKey}
              >
                <span />
              </div>
              <span className="stage-label l">{caption[left]}</span>
              <span className="stage-label r">{caption[right]}</span>
            </>
          ) : (
            <>
              <div className="stage-layer">
                <img src={src[left]} alt={caption[left]} style={imgStyle} draggable={false} />
              </div>
              <div className="stage-layer" style={{ opacity: flip ? 1 : 0 }}>
                <img src={src[right]} alt={caption[right]} style={imgStyle} draggable={false} />
              </div>
              <span className="stage-label l on">{caption[flip ? right : left]}</span>
              <span className="stage-label r">{playing ? "● AUTO" : "❚❚ PAUSED"}</span>
            </>
          )}
        </div>
      )}
      <p className="compare-help no-print">{help}</p>
    </div>
  );
}
