import { useMemo, useState } from "react";
import { CITIES, CLASSES, CLASS_BY_IDX, LEVELS, fmtInt, fmtPct, levelOf, signed } from "../lib/constants";
import { useWidth } from "../lib/hooks";
import { tip } from "./Tip";
import { Swatch } from "./ui";

// Bar with rounded data-end, square at the baseline.
function barPath(x, y, w, h, r = 3) {
  if (h <= 0) return "";
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

function niceMax(v) {
  const p = 10 ** Math.floor(Math.log10(Math.max(v, 1)));
  const f = v / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}

/* ---------------------------------------------------------------- bar list */
export function BarList({ rows, onSelect }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="barlist">
      {rows.map((r) => {
        const clickable = Boolean(onSelect && r.selectable !== false);
        return (
          <li key={r.key}>
            <button
              type="button"
              className={clickable ? "barlist-row clickable" : "barlist-row"}
              onClick={clickable ? () => onSelect(r) : undefined}
              onMouseMove={(e) => r.tip && tip.show(e, r.tip)}
              onMouseLeave={tip.hide}
              onFocus={(e) => r.tip && tip.showEl(e.currentTarget, r.tip)}
              onBlur={tip.hide}
            >
              <span className="barlist-label">
                {r.swatch && <Swatch color={r.swatch} />}
                {r.label}
              </span>
              <span className="barlist-track">
                <span className="barlist-fill" style={{ width: `${(100 * r.value) / max}%` }} />
              </span>
              <span className="barlist-val mono">{r.display}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/* --------------------------------------------------------------- histogram */
export function Histogram({ values, bin = 5, height = 220 }) {
  const [ref, w] = useWidth();
  const { counts, hi } = useMemo(() => {
    const top = Math.max(bin * 14, Math.ceil(Math.max(0, ...values) / bin) * bin);
    const c = new Array(top / bin).fill(0);
    values.forEach((v) => {
      c[Math.min(c.length - 1, Math.floor(v / bin))] += 1;
    });
    return { counts: c, hi: top };
  }, [values, bin]);

  const yMax = niceMax(Math.max(1, ...counts));
  const m = { l: 34, r: 8, t: 8, b: 26 };
  const iw = Math.max(0, w - m.l - m.r);
  const ih = height - m.t - m.b;
  const bw = iw / counts.length;

  return (
    <div ref={ref} className="chart">
      {w > 0 && (
        <svg width={w} height={height} role="img" aria-label="Tiles by percentage of frame changed">
          {[0, 0.25, 0.5, 0.75, 1].map((f) => {
            const y = m.t + ih - ih * f;
            return (
              <g key={f}>
                <line x1={m.l} x2={w - m.r} y1={y} y2={y} className={f === 0 ? "g-axis" : "g-line"} />
                <text x={m.l - 6} y={y + 3.5} className="g-tick" textAnchor="end">
                  {Math.round(f * yMax)}
                </text>
              </g>
            );
          })}
          {counts.map((c, i) => {
            const lo = i * bin;
            const x = m.l + i * bw;
            const h = (ih * c) / yMax;
            const content = (
              <>
                <b>
                  {lo}–{lo + bin}% of frame changed
                </b>
                <div>
                  {fmtInt(c)} tiles · {levelOf(lo).label} level
                </div>
              </>
            );
            return (
              <g key={lo}>
                <path d={barPath(x + 1, m.t + ih - h, Math.max(1, bw - 2), h)} fill={levelOf(lo).color} />
                <rect
                  x={x}
                  y={m.t}
                  width={bw}
                  height={ih}
                  fill="transparent"
                  onMouseMove={(e) => tip.show(e, content)}
                  onMouseLeave={tip.hide}
                />
                {lo % 10 === 0 && (
                  <text x={x} y={height - 8} className="g-tick" textAnchor={i === 0 ? "start" : "middle"}>
                    {lo}%
                  </text>
                )}
              </g>
            );
          })}
          <text x={m.l + iw} y={height - 8} className="g-tick" textAnchor="end">
            {hi}%
          </text>
        </svg>
      )}
    </div>
  );
}

/* ------------------------------------------------------- level stack (100%) */
export function LevelStack({ counts, total }) {
  return (
    <div
      className="stack"
      role="img"
      aria-label={LEVELS.map((l) => `${l.label} ${counts[l.key]}`).join(", ")}
    >
      {LEVELS.map(
        (l) =>
          counts[l.key] > 0 && (
            <span
              key={l.key}
              style={{ flexGrow: counts[l.key], background: l.color }}
              onMouseMove={(e) =>
                tip.show(
                  e,
                  <>
                    <b>{l.label}</b>
                    <div>
                      {counts[l.key]} tiles · {fmtPct((100 * counts[l.key]) / total)}
                    </div>
                  </>,
                )
              }
              onMouseLeave={tip.hide}
            />
          ),
      )}
    </div>
  );
}

/* -------------------------------------------------------------- sector plot */
export function SectorMap({ points, onOpen }) {
  return (
    <div className="sector-grid">
      {CITIES.map((c) => (
        <CityPlot key={c.name} city={c} points={points.filter((p) => p.region === c.name)} onOpen={onOpen} />
      ))}
    </div>
  );
}

function CityPlot({ city, points, onOpen }) {
  const [ref, w] = useWidth();
  const [hover, setHover] = useState(null);
  const h = Math.round(w * 0.78);
  const pad = 14;
  const sorted = useMemo(() => [...points].sort((a, b) => a.pct - b.pct), [points]);
  const sx = (lon) => pad + ((lon - city.lon[0]) / (city.lon[1] - city.lon[0])) * (w - 2 * pad);
  const sy = (lat) => h - pad - ((lat - city.lat[0]) / (city.lat[1] - city.lat[0])) * (h - 2 * pad);

  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    let best = null;
    let bd = 14 * 14;
    for (const p of sorted) {
      const dx = sx(p.lon) - mx;
      const dy = sy(p.lat) - my;
      const d = dx * dx + dy * dy;
      if (d <= bd) {
        bd = d;
        best = p;
      }
    }
    setHover(best);
    if (best) {
      tip.show(
        e,
        <>
          <b className="mono">TILE {best.pair_id}</b>
          <div>
            {fmtPct(best.pct)} changed · {levelOf(best.pct).label}
          </div>
          <div className="muted">Click to open assessment</div>
        </>,
      );
    } else tip.hide();
  };

  const priority = points.filter((p) => p.pct >= 25).length;
  return (
    <figure className="city">
      <figcaption>
        <b>{city.name}</b>
        <span className="mono">
          {points.length} tiles · {priority} priority
        </span>
      </figcaption>
      <div ref={ref} className="city-plot">
        {w > 0 && (
          <svg
            width={w}
            height={h}
            onMouseMove={onMove}
            onMouseLeave={() => {
              setHover(null);
              tip.hide();
            }}
            onClick={() => hover && onOpen(hover.pair_id)}
            style={{ cursor: hover ? "pointer" : "crosshair" }}
            role="img"
            aria-label={`${city.name}: ${points.length} tiles`}
          >
            {[1, 2, 3].map((k) => (
              <g key={k}>
                <line x1={(w * k) / 4} x2={(w * k) / 4} y1={0} y2={h} className="g-line" />
                <line y1={(h * k) / 4} y2={(h * k) / 4} x1={0} x2={w} className="g-line" />
              </g>
            ))}
            {sorted.map((p) => {
              const l = levelOf(p.pct);
              return (
                <circle
                  key={p.pair_id}
                  cx={sx(p.lon)}
                  cy={sy(p.lat)}
                  r={p === hover ? 7 : 4}
                  fill={l.color}
                  opacity={l.key === "low" ? 0.55 : 1}
                  className="dot"
                />
              );
            })}
            {hover && (
              <circle cx={sx(hover.lon)} cy={sy(hover.lat)} r={11} className="dot-ring" />
            )}
          </svg>
        )}
      </div>
    </figure>
  );
}

/* -------------------------------------------------------- transition matrix */
const RAMP = ["#0f2a47", "#104281", "#184f95", "#1c5cab", "#2a78d6", "#5598e7", "#86b6ef", "#cde2fb"];

export function TransitionMatrix({ matrix }) {
  if (!matrix) return null;
  let total = 0;
  matrix.forEach((row, i) =>
    row.forEach((v, j) => {
      if (i !== j) total += v;
    }),
  );
  return (
    <div>
      <div className="table-wrap">
        <table className="tmatrix">
          <thead>
            <tr>
              <th className="corner">
                <span>before ↓</span>
                <span>after →</span>
              </th>
              {CLASSES.map((c) => (
                <th key={c.idx} scope="col">
                  <Swatch color={c.color} />
                  {c.short}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CLASSES.map((rc, i) => (
              <tr key={rc.idx}>
                <th scope="row">
                  <Swatch color={rc.color} />
                  {rc.short}
                </th>
                {CLASSES.map((cc, j) => {
                  if (i === j) {
                    return (
                      <td key={cc.idx} className="diag" title="Same class">
                        ·
                      </td>
                    );
                  }
                  const v = matrix[i][j];
                  const share = total ? v / total : 0;
                  const step = share > 0 ? Math.min(RAMP.length - 1, Math.floor(Math.sqrt(share) * RAMP.length)) : -1;
                  const content = (
                    <>
                      <b>
                        {rc.short} → {cc.short}
                      </b>
                      <div>
                        {fmtInt(v)} px · {fmtPct(100 * share)} of changed area
                      </div>
                    </>
                  );
                  return (
                    <td
                      key={cc.idx}
                      tabIndex={share > 0 ? 0 : undefined}
                      className={step < 0 ? "zero" : "mono"}
                      style={step >= 0 ? { background: RAMP[step], color: step >= 5 ? "#0b0b0b" : "#fff" } : undefined}
                      onMouseMove={(e) => share > 0 && tip.show(e, content)}
                      onMouseLeave={tip.hide}
                      onFocus={(e) => tip.showEl(e.currentTarget, content)}
                      onBlur={tip.hide}
                    >
                      {share >= 0.001 ? fmtPct(100 * share, share < 0.1 ? 1 : 0) : share > 0 ? "<0.1" : ""}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="ramp-legend">
        <span>0%</span>
        {RAMP.map((c) => (
          <i key={c} style={{ background: c }} />
        ))}
        <span>100% of changed area</span>
        <em>square-root scale</em>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- delta bars */
export function DeltaBars({ rows }) {
  const max = Math.max(5, ...rows.map((r) => Math.abs(r.delta_pp)));
  return (
    <div className="delta">
      <div className="delta-axis">
        <span />
        <span className="delta-axis-labels">
          <span>◀ decrease</span>
          <span>increase ▶</span>
        </span>
        <span />
      </div>
      {rows.map((r) => {
        const c = CLASS_BY_IDX[r.class_idx];
        const width = `${(Math.abs(r.delta_pp) / max) * 50}%`;
        const up = r.delta_pp > 0;
        return (
          <div className="delta-row" key={r.class_idx}>
            <span className="delta-label">
              <Swatch color={c?.color} />
              {c?.short ?? r.class}
            </span>
            <span className="delta-track">
              <span className="delta-mid" />
              {r.delta_pp !== 0 && (
                <span
                  className={`delta-fill ${up ? "up" : "down"}`}
                  style={up ? { left: "50%", width } : { right: "50%", width }}
                />
              )}
            </span>
            <span className={r.delta_pp === 0 ? "delta-val mono muted" : "delta-val mono"}>
              {r.delta_pp === 0 ? "—" : `${signed(r.delta_pp)} pp`}
            </span>
          </div>
        );
      })}
    </div>
  );
}
