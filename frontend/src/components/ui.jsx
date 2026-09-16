import { CLASS_BY_IDX, CLASS_BY_NAME, LEVELS, fmtPct, levelOf, media } from "../lib/constants";
import { Icon } from "./Icons";

export function Swatch({ color }) {
  return <span className="sw" style={{ background: color }} aria-hidden="true" />;
}

export function ClassName({ idx, name, full = false }) {
  const c = (idx && CLASS_BY_IDX[idx]) || CLASS_BY_NAME[name];
  if (!c) return <span>{name}</span>;
  return (
    <span className="cls">
      <Swatch color={c.color} />
      {full ? c.name : c.short}
    </span>
  );
}

export function Transition({ t }) {
  if (!t) return <span className="muted">No change detected</span>;
  return (
    <span className="trans">
      <ClassName idx={t.from_idx} name={t.from} />
      <span className="trans-arrow" aria-label="became">
        →
      </span>
      <ClassName idx={t.to_idx} name={t.to} />
    </span>
  );
}

export function LevelBadge({ pct }) {
  const l = levelOf(pct);
  return (
    <span className={`lvl lvl-${l.key}`} title={`Change level ${l.label}: ≥ ${l.min}% of frame changed`}>
      <i style={{ color: l.color }} aria-hidden="true">
        {l.icon}
      </i>
      {l.label}
    </span>
  );
}

export function LevelLegend({ counts }) {
  return (
    <div className="lvl-legend">
      {LEVELS.map((l) => (
        <span key={l.key} title={`≥ ${l.min}% of frame changed`}>
          <i style={{ background: l.color }} />
          {l.label}
          {counts && <b>{counts[l.key]}</b>}
        </span>
      ))}
    </div>
  );
}

export function SourceBadge({ rec }) {
  if (rec?.metadata?.uploaded) return <span className="tag tag-model">Model · uploaded imagery</span>;
  if (rec?.source === "ground_truth") return <span className="tag tag-gt">Ground truth</span>;
  return <span className="tag tag-model">Model prediction</span>;
}

export function Panel({ title, sub, actions, children, className = "", flush = false }) {
  return (
    <section className={`panel ${className}`}>
      {(title || actions) && (
        <header className="panel-head">
          <div>
            {title && <h2>{title}</h2>}
            {sub && <p>{sub}</p>}
          </div>
          {actions && <div className="panel-actions">{actions}</div>}
        </header>
      )}
      <div className={flush ? "panel-body flush" : "panel-body"}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, sub, small = false }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className={small ? "stat-value small" : "stat-value"}>{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export function PageHead({ eyebrow, title, sub, actions }) {
  return (
    <div className="page-head">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function Notice({ kind = "info", children }) {
  return (
    <div className={`notice ${kind}`} role={kind === "error" ? "alert" : "status"}>
      <Icon name={kind === "info" ? "info" : "alert"} />
      <div>{children}</div>
    </div>
  );
}

export function Loading({ label = "Loading" }) {
  return (
    <div className="loading" role="status">
      <span className="scan" />
      {label}…
    </div>
  );
}

export function ErrorBox({ title, detail, hint }) {
  return (
    <div className="errorbox" role="alert">
      <Icon name="alert" size={20} />
      <div>
        <b>{title}</b>
        {detail && <div className="mono small">{detail}</div>}
        {hint && <div className="muted small">{hint}</div>}
      </div>
    </div>
  );
}

export function Segmented({ options, value, onChange, size, label }) {
  return (
    <div className={`seg ${size ?? ""}`} role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={o.value === value ? "on" : ""}
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          title={o.title}
        >
          {o.icon && <Icon name={o.icon} size={14} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function PairCard({ rec, onOpen }) {
  const m = rec.metadata ?? {};
  const l = levelOf(rec.changed_pct_of_frame);
  const open = () => onOpen(rec.pair_id);
  return (
    <div
      className="pcard"
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), open())}
      style={{ "--lvl": l.color }}
      aria-label={`Tile ${rec.pair_id}, ${rec.changed_pct_of_frame}% changed, ${l.label} level`}
    >
      <div className="pcard-img">
        <img src={media(rec.overlay)} alt="" loading="lazy" />
        <img className="pcard-after" src={media(rec.image2)} alt="" loading="lazy" />
        <span className="pcard-pct mono">{fmtPct(rec.changed_pct_of_frame)}</span>
        {rec.similarity !== undefined && (
          <span className="pcard-sim mono">{Math.round(rec.similarity * 100)}% match</span>
        )}
      </div>
      <div className="pcard-body">
        <div className="pcard-row">
          <span className="mono strong">TILE {rec.pair_id}</span>
          <LevelBadge pct={rec.changed_pct_of_frame} />
        </div>
        <div className="pcard-meta">
          {m.uploaded
            ? "Uploaded imagery"
            : `${m.region ?? "—"} · ${m.date_before?.slice(0, 7) ?? "—"} → ${m.date_after?.slice(0, 7) ?? "—"}`}
        </div>
        <Transition t={rec.top_transitions?.[0]} />
      </div>
    </div>
  );
}

export function PairTable({ rows, onOpen, ranked = false }) {
  const withSim = rows.some((r) => r.similarity !== undefined);
  return (
    <div className="table-wrap">
      <table className="dtable">
        <thead>
          <tr>
            {ranked && <th>#</th>}
            <th>Tile</th>
            <th>Sector</th>
            <th>Level</th>
            <th className="num">Changed</th>
            {withSim && <th className="num">Match</th>}
            <th>Primary transition</th>
            <th>Period</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const m = r.metadata ?? {};
            return (
              <tr
                key={r.pair_id}
                tabIndex={0}
                onClick={() => onOpen(r.pair_id)}
                onKeyDown={(e) => e.key === "Enter" && onOpen(r.pair_id)}
              >
                {ranked && <td className="mono muted">{String(i + 1).padStart(2, "0")}</td>}
                <td>
                  <span className="tile-cell">
                    <img src={media(r.overlay)} alt="" loading="lazy" />
                    <span className="mono">{r.pair_id}</span>
                  </span>
                </td>
                <td>{m.uploaded ? "Upload" : (m.region ?? "—")}</td>
                <td>
                  <LevelBadge pct={r.changed_pct_of_frame} />
                </td>
                <td className="num mono">{fmtPct(r.changed_pct_of_frame)}</td>
                {withSim && (
                  <td className="num mono">
                    {r.similarity !== undefined ? `${Math.round(r.similarity * 100)}%` : "—"}
                  </td>
                )}
                <td>
                  <Transition t={r.top_transitions?.[0]} />
                </td>
                <td className="mono muted nowrap">
                  {m.date_before ? `${m.date_before.slice(0, 7)} → ${m.date_after.slice(0, 7)}` : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
