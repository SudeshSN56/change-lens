import { useEffect } from "react";
import { AssessmentBody, AssessmentSummary } from "../components/Assessment";
import { Compare } from "../components/Compare";
import { Icon } from "../components/Icons";
import {
  ErrorBox,
  LevelBadge,
  Loading,
  PairCard,
  Panel,
  Segmented,
  SourceBadge,
  Transition,
} from "../components/ui";
import { dominantActivity, fmtPct, levelOf, media, signed } from "../lib/constants";
import { getNavList, go, isTyping, setNavList, useJSON } from "../lib/hooks";

const Match = ({ ok }) => <span className={ok ? "match yes" : "match no"}>{ok ? "✓ Agree" : "✕ Differ"}</span>;

function ModelVsTruth({ model, gt }) {
  const mt = model.top_transitions?.[0];
  const gtt = gt.top_transitions?.[0];
  const ma = dominantActivity(model);
  const ga = dominantActivity(gt);
  return (
    <Panel
      title="Model vs ground truth"
      sub="Summary figures for this tile only. Pixel-level accuracy (IoU, SeK) is measured over the whole test set."
      flush
    >
      <div className="table-wrap">
        <table className="dtable static cmp">
          <thead>
            <tr>
              <th />
              <th>Model</th>
              <th>Ground truth</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>Frame changed</th>
              <td className="mono">{fmtPct(model.changed_pct_of_frame, 2)}</td>
              <td className="mono">{fmtPct(gt.changed_pct_of_frame, 2)}</td>
              <td className="mono muted nowrap">{signed(model.changed_pct_of_frame - gt.changed_pct_of_frame, 2)} pp</td>
            </tr>
            <tr>
              <th>Change level</th>
              <td>
                <LevelBadge pct={model.changed_pct_of_frame} />
              </td>
              <td>
                <LevelBadge pct={gt.changed_pct_of_frame} />
              </td>
              <td>
                <Match ok={levelOf(model.changed_pct_of_frame).key === levelOf(gt.changed_pct_of_frame).key} />
              </td>
            </tr>
            <tr>
              <th>Primary transition</th>
              <td>
                <Transition t={mt} />
              </td>
              <td>
                <Transition t={gtt} />
              </td>
              <td>
                <Match ok={mt?.from_idx === gtt?.from_idx && mt?.to_idx === gtt?.to_idx} />
              </td>
            </tr>
            <tr>
              <th>Dominant activity</th>
              <td>{ma?.label ?? "None"}</td>
              <td>{ga?.label ?? "None"}</td>
              <td>
                <Match ok={ma?.key === ga?.key} />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

export default function Dossier({ id, params }) {
  const model = useJSON(`/api/pairs/${id}`);
  const gt = useJSON(`/api/pairs/${id}?source=gt`);
  const similar = useJSON(`/api/pairs/${id}/similar?k=6`);

  const primary = model.data;
  const hasGt = Boolean(gt.data && primary && primary.source !== "ground_truth");
  const showGt = params.get("src") === "gt" && hasGt;
  const rec = showGt ? gt.data : primary;

  const nav = getNavList();
  const idx = nav.ids.indexOf(id);
  const prev = idx > 0 ? nav.ids[idx - 1] : null;
  const next = idx >= 0 && idx < nav.ids.length - 1 ? nav.ids[idx + 1] : null;

  useEffect(() => {
    const on = (e) => {
      if (isTyping(e.target) || e.target.closest?.("[role=slider]")) return;
      if (e.key === "ArrowLeft" && prev) go(`/pair/${prev}`);
      if (e.key === "ArrowRight" && next) go(`/pair/${next}`);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [prev, next]);

  if (model.error && !primary) {
    return <ErrorBox title={`Tile ${id} not found`} detail={model.error} />;
  }
  if (!rec) return <Loading label={`Loading tile ${id}`} />;

  const m = rec.metadata ?? {};
  const stale = rec.pair_id !== id;
  const openSimilar = (sid) => {
    setNavList(
      similar.data?.results.map((r) => r.pair_id) ?? [],
      `Similar to tile ${id}`,
    );
    go(`/pair/${sid}`);
  };

  return (
    <div className={stale ? "page stale" : "page"}>
      <div className="crumbs no-print">
        <button
          type="button"
          className="btn ghost sm"
          onClick={() => (window.history.length > 1 ? window.history.back() : go("/"))}
        >
          <Icon name="back" size={14} /> Back
        </button>
        {idx >= 0 && (
          <>
            <span className="crumbs-label">{nav.label}</span>
            <span className="mono muted">
              {idx + 1} / {nav.ids.length}
            </span>
            <button type="button" className="btn sm" disabled={!prev} onClick={() => go(`/pair/${prev}`)} title="Previous tile (←)">
              <Icon name="back" size={14} />
            </button>
            <button type="button" className="btn sm" disabled={!next} onClick={() => go(`/pair/${next}`)} title="Next tile (→)">
              <Icon name="next" size={14} />
            </button>
          </>
        )}
      </div>

      <div className="dossier-title">
        <div>
          <div className="eyebrow">Tile assessment</div>
          <h1 className="mono">TILE {id}</h1>
          <div className="dossier-tags">
            <LevelBadge pct={rec.changed_pct_of_frame} />
            <SourceBadge rec={rec} />
            <span className="strong">{m.region ?? "—"}</span>
            {m.date_before && (
              <span className="mono muted">
                {m.date_before} → {m.date_after}
              </span>
            )}
          </div>
        </div>
        <div className="dossier-actions no-print">
          {hasGt && (
            <Segmented
              label="Label source"
              value={showGt ? "gt" : "model"}
              onChange={(v) => go(`/pair/${id}${v === "gt" ? "?src=gt" : ""}`)}
              options={[
                { value: "model", label: "Model prediction" },
                { value: "gt", label: "Ground truth" },
              ]}
            />
          )}
          <button type="button" className="btn" onClick={() => window.print()}>
            <Icon name="print" size={14} /> Print brief
          </button>
        </div>
      </div>

      <div className="print-only print-trip">
        {[
          [rec.image1, "Before"],
          [rec.image2, "After"],
          [rec.overlay, "Change map"],
        ].map(([src, label]) => (
          <figure key={label}>
            <img src={media(src)} alt={label} />
            <figcaption>{label}</figcaption>
          </figure>
        ))}
      </div>

      <div className="dossier-grid">
        <Panel title="Imagery" className="no-print">
          <Compare rec={rec} />
        </Panel>
        <div className="stack-col">
          <Panel title="Assessment">
            <AssessmentSummary rec={rec} />
          </Panel>
          {hasGt && <ModelVsTruth model={primary} gt={gt.data} />}
        </div>
      </div>

      <AssessmentBody rec={rec} />

      {similar.data?.results?.length > 0 && (
        <Panel
          title="Tiles with a similar change pattern"
          sub="Ranked by cosine similarity of the 36-cell transition signature"
          className="no-print"
        >
          <div className="grid">
            {similar.data.results.map((r) => (
              <PairCard key={r.pair_id} rec={r} onOpen={openSimilar} />
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
