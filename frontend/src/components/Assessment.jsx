import { CLASS_BY_IDX, FRAME_PX, activityTotals, fmtInt, fmtPct, levelOf, matrixOf, signed } from "../lib/constants";
import { BarList, DeltaBars, TransitionMatrix } from "./charts";
import { Panel, Stat, Swatch, Transition } from "./ui";

/** Description + headline figures. Shared by the tile assessment and the upload result. */
export function AssessmentSummary({ rec }) {
  const t = rec.top_transitions?.[0];
  const acts = activityTotals(matrixOf(rec)).filter((a) => a.px > 0);
  const actPx = acts.reduce((s, a) => s + a.px, 0);
  const top = [...acts].sort((a, b) => b.px - a.px)[0];
  return (
    <>
      <p className="prose">{rec.description}</p>
      <div className="kpis kpis-2">
        <Stat
          label="Frame changed"
          value={fmtPct(rec.changed_pct_of_frame, 2)}
          sub={`${levelOf(rec.changed_pct_of_frame).label} change level`}
        />
        <Stat label="Changed pixels" value={fmtInt(rec.changed_px)} sub={`of ${fmtInt(FRAME_PX)} in the 512 × 512 tile`} />
        <Stat
          label="Primary transition"
          value={<Transition t={t} />}
          sub={t ? `${fmtPct(t.pct_of_frame, 2)} of frame` : "—"}
          small
        />
        <Stat
          label="Dominant activity"
          value={top?.label ?? "None"}
          sub={top ? `${fmtPct((100 * top.px) / actPx)} of changed pixels` : "—"}
          small
        />
      </div>
    </>
  );
}

/** Charts, tables and metadata below the imagery. */
export function AssessmentBody({ rec }) {
  const matrix = matrixOf(rec);
  const acts = activityTotals(matrix).filter((a) => a.px > 0);
  const actPx = acts.reduce((s, a) => s + a.px, 0);
  const rows = [...acts]
    .sort((a, b) => b.px - a.px)
    .map((a) => ({
      key: a.key,
      label: a.label,
      value: a.px,
      display: fmtPct((100 * a.px) / actPx),
      tip: (
        <>
          <b>{a.label}</b>
          <div>
            {fmtInt(a.px)} px · {fmtPct((100 * a.px) / FRAME_PX, 2)} of frame
          </div>
        </>
      ),
    }));

  return (
    <>
      <div className="cols cols-2">
        <Panel title="Activity in this tile" sub="Changed pixels grouped by type of transition">
          {rows.length ? <BarList rows={rows} /> : <p className="muted">No change detected in this tile.</p>}
        </Panel>
        <Panel title="Land-cover shift" sub="Change in each class's share of the changed area, in percentage points">
          <DeltaBars rows={rec.per_category} />
        </Panel>
      </div>

      <div className="cols cols-2">
        <Panel title="Transition matrix" sub="Rows are land cover before, columns after. Cells are shares of all changed pixels.">
          <TransitionMatrix matrix={matrix} />
        </Panel>
        <Panel title="Land cover within the changed area">
          {/* The denominator line is mandatory: these are shares of the changed region,
              not of the frame, and the table is misleading without it. */}
          <div className="denominator">
            Percentages are shares of the <b>changed area only</b> — <b>{fmtInt(rec.changed_px)} px</b>, which is{" "}
            <b>{fmtPct(rec.changed_pct_of_frame, 2)}</b> of the 512×512 frame. SECOND labels land cover only inside
            changed regions.
            {rec.same_category_px > 0 && (
              <>
                {" "}
                <b>{fmtInt(rec.same_category_px)} px</b> changed in appearance but stayed in the same category.
              </>
            )}
          </div>
          <CategoryTable rows={rec.per_category} />
        </Panel>
      </div>

      <MetadataPanel rec={rec} />
    </>
  );
}

function CategoryTable({ rows }) {
  return (
    <div className="table-wrap">
      <table className="dtable static">
        <thead>
          <tr>
            <th>Category</th>
            <th className="num">Before</th>
            <th className="num">After</th>
            <th className="num">Δ pp</th>
            <th className="num">Relative</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.class_idx}>
              <td>
                <Swatch color={CLASS_BY_IDX[c.class_idx]?.color} />
                {c.class}
              </td>
              <td className="num mono">{fmtPct(c.pct_before, 2)}</td>
              <td className="num mono">{fmtPct(c.pct_after, 2)}</td>
              <td className={`num mono ${c.delta_pp > 0 ? "up" : c.delta_pp < 0 ? "down" : "muted"}`}>
                {c.delta_pp === 0 ? "0.00" : signed(c.delta_pp, 2)}
              </td>
              {/* null relative_pct renders as "new" or "—", never a number */}
              <td className={`num mono ${c.relative_pct === null ? "muted" : c.relative_pct > 0 ? "up" : "down"}`}>
                {c.relative_pct === null
                  ? c.pct_after > 0
                    ? "new"
                    : "—"
                  : `${signed(c.relative_pct)}%`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MetadataPanel({ rec }) {
  const m = rec.metadata ?? {};
  // Uploaded and indexed records show the same block; an upload only adds the
  // fields that are specific to it (its analysis id and the native sizes).
  const fields = [
    ["Sector", m.region],
    ["Coordinates", m.lat != null ? `${m.lat.toFixed(4)}, ${m.lon.toFixed(4)}` : null],
    ["Before image", m.date_before],
    ["After image", m.date_after],
    ["Platform", m.satellite],
    ["Record source", rec.source === "ground_truth" ? "Ground-truth labels" : "Model prediction"],
    ...(m.uploaded
      ? [
          ["Matched tile", m.matched_pair_id ?? "None — unseen imagery"],
          ["Analysis id", rec.pair_id],
          ["Native size · before", m.native_size_before?.join(" × ")],
          ["Native size · after", m.native_size_after?.join(" × ")],
        ]
      : []),
  ];
  return (
    <Panel title="Record metadata">
      <dl className="meta-grid">
        {fields.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd className="mono">{v ?? "—"}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}
