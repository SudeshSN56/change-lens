// 11.5-18 s: tile 02353 in a window; the cursor drags a swipe from 2017 to 2019.
import { Easing, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { C, MONO } from "../theme";
import { Cursor, Paper, Rows, Typed, Win } from "../ui";

export const TILE = { x: 170, y: 108, size: 820 };

function Chip({ side, children }) {
  return (
    <div
      style={{
        position: "absolute", top: 16, [side]: 16, padding: "6px 12px", background: "rgba(20,20,20,0.82)", color: "#fff",
        font: `500 18px ${MONO}`,
      }}
    >
      {children}
    </div>
  );
}

export function TileImages({ pos }) {
  return (
    <>
      <Img src={staticFile("02353_before.png")} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
      <Img
        src={staticFile("02353_after.png")}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", clipPath: `inset(0 0 0 ${pos}%)` }}
      />
    </>
  );
}

export function BeforeAfter() {
  const frame = useCurrentFrame();
  // Handle position in % of the tile width: grabbed at the right edge, dragged left, then settled mid-way.
  const pos = interpolate(frame, [0, 40, 120, 160, 195], [96, 96, 6, 50, 50], {
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic), // same easing as <Cursor>, so the pointer stays on the handle
  });
  const handleX = (p) => TILE.x + 2 + TILE.size * p + 6; // cursor tip on the handle at fraction p
  const handleY = TILE.y + 470;
  return (
    <Paper grid>
      <Win title="tile_02353 · chengdu" x={TILE.x} y={TILE.y} w={TILE.size + 4} h={TILE.size + 44}>
        <TileImages pos={pos} />
        <div style={{ position: "absolute", top: 0, bottom: 0, left: `${pos}%`, width: 3, marginLeft: -1.5, background: "#fff" }}>
          <div
            style={{
              position: "absolute", top: "50%", left: "50%", width: 44, height: 44, transform: "translate(-50%, -50%)",
              borderRadius: "50%", border: "3px solid #fff", background: "rgba(20,20,20,0.8)",
            }}
          />
        </div>
        <Chip side="left">before · 2017-02-14</Chip>
        {pos < 80 && <Chip side="right">after · 2019-02-06</Chip>}
      </Win>

      <div style={{ position: "absolute", left: 1110, top: 170, fontSize: 64, fontWeight: 500, lineHeight: 1.15 }}>
        <Typed text="same ground," start={20} cps={26} caret={frame < 48} />
        <br />
        {frame >= 48 && <Typed text="before & after." start={48} cps={26} caretColor={C.blue} />}
      </div>

      <Win title="metadata" x={1110} y={470} w={560} h={250} delay={70}>
        <Rows
          rows={[
            ["sector", "chengdu"],
            ["before image", "2017-02-14"],
            ["after image", "2019-02-06"],
            ["tile", "512 × 512 px"],
            ["split", "held-out test"],
          ]}
        />
      </Win>

      <Cursor
        path={[
          [0, 1500, 900],
          [34, handleX(0.96), handleY],
          [40, handleX(0.96), handleY],
          [120, handleX(0.06), handleY],
          [160, handleX(0.5), handleY],
          [195, 1300, 760],
        ]}
        clicks={[38]}
      />
    </Paper>
  );
}
