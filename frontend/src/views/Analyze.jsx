import { useEffect, useMemo, useRef, useState } from "react";
import { AssessmentBody, AssessmentSummary } from "../components/Assessment";
import { Compare } from "../components/Compare";
import { Icon } from "../components/Icons";
import { ErrorBox, LevelBadge, Notice, PageHead, PairCard, Panel, SourceBadge, Stat, Transition } from "../components/ui";
import { LEVELS, fmtPct, levelOf, media } from "../lib/constants";
import { go, postForm, setNavList } from "../lib/hooks";

// Pairs are sent to /api/analyze/batch in chunks so the results table fills in as the
// model works instead of staying blank until the whole batch is done.
const CHUNK = 4;

/** Key used to pair a "before" file with its "after": the longest digit run in the name
 *  (00003_before.png <-> 00003_after.png, im1_00003 <-> im2_00003), else the stem. */
function pairKey(name) {
  const stem = name.replace(/\.[^.]+$/, "");
  const runs = stem.match(/\d+/g);
  if (runs) return runs.sort((a, b) => b.length - a.length)[0].replace(/^0+(?=\d)/, "");
  return stem.toLowerCase();
}

/** Match befores to afters by key; whatever is left over is paired in name order. */
function pairFiles(befores, afters) {
  const byKey = new Map();
  afters.forEach((f) => {
    const k = pairKey(f.name);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(f);
  });
  const pairs = [];
  const leftB = [];
  befores.forEach((b) => {
    const k = pairKey(b.name);
    const q = byKey.get(k);
    if (q?.length) pairs.push({ before: b, after: q.shift(), key: k, byName: true });
    else leftB.push(b);
  });
  const leftA = [...byKey.values()].flat().sort((a, b) => a.name.localeCompare(b.name));
  leftB.sort((a, b) => a.name.localeCompare(b.name));
  const n = Math.min(leftB.length, leftA.length);
  for (let i = 0; i < n; i++) pairs.push({ before: leftB[i], after: leftA[i], key: null, byName: false });
  return { pairs, unpaired: [...leftB.slice(n), ...leftA.slice(n)] };
}

function Thumb({ file }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return url ? <img className="drop-thumb" src={url} alt="" /> : null;
}

function DropZone({ label, hint, files, onFiles }) {
  const input = useRef(null);
  const [over, setOver] = useState(false);

  const add = (list) => {
    const imgs = [...list].filter((f) => f.type.startsWith("image/") || /\.(png|jpe?g|tiff?|bmp|webp)$/i.test(f.name));
    if (imgs.length) onFiles([...files, ...imgs]);
  };
  const remove = (i) => onFiles(files.filter((_, j) => j !== i));

  return (
    <div
      className={`drop${over ? " over" : ""}${files.length ? " has" : ""}`}
      role="button"
      tabIndex={0}
      onClick={() => input.current.click()}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), input.current.click())}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        add(e.dataTransfer.files ?? []);
      }}
      aria-label={`${label} images: ${files.length ? `${files.length} selected` : "none selected"}`}
    >
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          add(e.target.files ?? []);
          e.target.value = "";
        }}
      />
      <div className="drop-head">
        <span className="eyebrow">{label}</span>
        <span className="muted small">
          {files.length ? `${files.length} file${files.length === 1 ? "" : "s"}` : hint}
        </span>
      </div>
      {files.length ? (
        <ul className="drop-list" onClick={(e) => e.stopPropagation()}>
          {files.map((f, i) => (
            <li key={`${f.name}-${f.size}-${i}`} className="mono">
              <Thumb file={f} />
              <span className="ellipsis" title={f.name}>
                {f.name}
              </span>
              <span className="muted">{(f.size / 1024).toFixed(0)} KB</span>
              <button type="button" className="icon-btn sm" onClick={() => remove(i)} title="Remove" aria-label={`Remove ${f.name}`}>
                <Icon name="x" size={12} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="drop-empty">
          <Icon name="image" size={30} />
          <b>Drop one or more images, or click to browse</b>
          <span className="muted small">512 × 512 aerial RGB tiles match the training domain</span>
        </div>
      )}
    </div>
  );
}

/** One row per submitted pair: queued, running, done or failed. */
function BatchTable({ rows, selected, onSelect }) {
  return (
    <div className="table-wrap">
      <table className="dtable">
        <thead>
          <tr>
            <th>#</th>
            <th>Before</th>
            <th>After</th>
            <th>Status</th>
            <th>Level</th>
            <th className="num">Changed</th>
            <th>Primary transition</th>
            <th>Matched tile</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const rec = row.result?.record;
            const m = rec?.metadata ?? {};
            return (
              <tr
                key={row.id}
                className={i === selected ? "sel" : ""}
                tabIndex={0}
                onClick={() => rec && onSelect(i)}
                onKeyDown={(e) => e.key === "Enter" && rec && onSelect(i)}
              >
                <td className="mono muted">{String(i + 1).padStart(2, "0")}</td>
                <td className="mono ellipsis" title={row.before.name}>
                  {rec && <img className="drop-thumb" src={media(rec.overlay)} alt="" loading="lazy" />} {row.before.name}
                </td>
                <td className="mono ellipsis" title={row.after.name}>
                  {row.after.name}
                </td>
                <td>
                  {row.status === "queued" && <span className="muted">Queued</span>}
                  {row.status === "running" && (
                    <span className="warn-text">
                      <span className="status-dot ok" /> Analyzing…
                    </span>
                  )}
                  {row.status === "done" && <span className="ok-text">Done{row.result.ood_warning ? " · resampled" : ""}</span>}
                  {row.status === "failed" && (
                    <span className="warn-text" title={row.error}>
                      Failed
                    </span>
                  )}
                </td>
                <td>{rec ? <LevelBadge pct={rec.changed_pct_of_frame} /> : "—"}</td>
                <td className="num mono">{rec ? fmtPct(rec.changed_pct_of_frame) : "—"}</td>
                <td>{rec ? <Transition t={rec.top_transitions?.[0]} /> : row.error ? <span className="muted small">{row.error}</span> : "—"}</td>
                <td className="mono muted">{m.matched_pair_id ?? (rec ? "None" : "—")}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** The assessment for one uploaded pair. `index`/`total` label it inside a batch; `actions`
 *  go in the title bar (screen only). Printed, the imagery panel is replaced by a flat
 *  before / after / change-map strip like the tile dossier. */
function Brief({ row, index, total, actions, children }) {
  const { result: res, before, after } = row;
  const rec = res.record;
  return (
    <div className="brief-page">
      <div className="dossier-title">
        <div>
          <h1>Analysis {rec.pair_id.toUpperCase()}</h1>
          <div className="dossier-tags">
            <LevelBadge pct={rec.changed_pct_of_frame} />
            <SourceBadge rec={rec} />
            {total > 1 && <span className="muted">Pair {index + 1} of {total}</span>}
            <span className="mono muted small">
              {before.name} → {after.name}
            </span>
          </div>
        </div>
        {actions && <div className="dossier-actions no-print">{actions}</div>}
      </div>

      {res.ood_warning && <Notice kind="warn">{res.ood_note}</Notice>}

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
        <div className="dossier-media no-print">
          <Panel title="Imagery">
            <Compare rec={rec} />
          </Panel>
        </div>
        <div className="stack-col">
          <Panel title="Assessment">
            <AssessmentSummary rec={rec} />
          </Panel>
          <AssessmentBody rec={rec} />
        </div>
      </div>
      {children}
    </div>
  );
}

export default function Analyze({ health }) {
  const [befores, setBefores] = useState([]);
  const [afters, setAfters] = useState([]);
  const [rows, setRows] = useState([]); // submitted pairs with status/result
  const [picked, setPicked] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [printAll, setPrintAll] = useState(false);
  const cancel = useRef(false);

  // "Print all briefs": mount every finished pair's brief (print-only), wait for its images,
  // open the print dialog, then unmount again once the dialog closes.
  useEffect(() => {
    if (!printAll) return undefined;
    let alive = true;
    const onAfter = () => setPrintAll(false);
    window.addEventListener("afterprint", onAfter);
    const imgs = [...document.querySelectorAll(".print-all img")];
    Promise.all(imgs.map((im) => (im.complete ? Promise.resolve() : new Promise((r) => (im.onload = im.onerror = r)))))
      .then(() => new Promise((r) => setTimeout(r, 150)))
      .then(() => alive && window.print());
    return () => {
      alive = false;
      window.removeEventListener("afterprint", onAfter);
    };
  }, [printAll]);

  useEffect(() => {
    if (!busy) return undefined;
    const t0 = Date.now();
    const t = setInterval(() => setElapsed((Date.now() - t0) / 1000), 100);
    return () => clearInterval(t);
  }, [busy]);

  const { pairs, unpaired } = useMemo(() => pairFiles(befores, afters), [befores, afters]);

  const run = async () => {
    if (!pairs.length || busy) return;
    const queue = pairs.map((p, i) => ({ id: `${Date.now()}-${i}`, ...p, status: "queued", result: null, error: null }));
    setRows(queue);
    setPicked(null);
    setBusy(true);
    setErr(null);
    setElapsed(0);
    cancel.current = false;

    const patch = (from, to, fn) =>
      setRows((prev) => prev.map((r, i) => (i >= from && i < to ? { ...r, ...fn(r, i - from) } : r)));

    try {
      for (let start = 0; start < queue.length; start += CHUNK) {
        if (cancel.current) break;
        const end = Math.min(start + CHUNK, queue.length);
        const fd = new FormData();
        for (let i = start; i < end; i++) {
          fd.append("before", queue[i].before);
          fd.append("after", queue[i].after);
        }
        patch(start, end, () => ({ status: "running" }));
        try {
          const r = await postForm("/api/analyze/batch", fd);
          patch(start, end, (_, j) => {
            const it = r.items[j];
            return it?.ok ? { status: "done", result: it.result } : { status: "failed", error: it?.error ?? "No result returned" };
          });
        } catch (e) {
          // A whole-chunk failure (network, 4xx) marks every pair in it; later chunks still run.
          patch(start, end, () => ({ status: "failed", error: e.message }));
          if (/session|sign/i.test(e.message)) throw e;
        }
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
      setRows((prev) => prev.map((r) => (r.status === "queued" || r.status === "running" ? { ...r, status: "failed", error: "Cancelled" } : r)));
    }
  };

  // Until the user picks a row, show the first finished pair as soon as it lands.
  const firstDone = rows.findIndex((r) => r.status === "done");
  const selected = picked !== null && rows[picked]?.status === "done" ? picked : firstDone >= 0 ? firstDone : null;
  const res = selected !== null ? rows[selected].result : null;

  useEffect(() => {
    if (res?.similar) setNavList(res.similar.map((s) => s.pair_id), "Similar to uploaded imagery");
  }, [res]);

  const reset = () => {
    cancel.current = true;
    setBefores([]);
    setAfters([]);
    setRows([]);
    setPicked(null);
    setErr(null);
  };

  const done = rows.filter((r) => r.status === "done");
  const failed = rows.filter((r) => r.status === "failed");
  const rec = res?.record;
  const ready = health?.checkpoint_exists;
  const many = rows.length > 1;

  const levelCounts = LEVELS.map((l) => ({ ...l, n: done.filter((r) => levelOf(r.result.record.changed_pct_of_frame).key === l.key).length }));
  const meanPct = done.length ? done.reduce((s, r) => s + r.result.record.changed_pct_of_frame, 0) / done.length : 0;
  const maxRow = done.reduce((best, r) => (!best || r.result.record.changed_pct_of_frame > best.result.record.changed_pct_of_frame ? r : best), null);

  return (
    <div className="page">
      <PageHead
        title="Assess new before / after pairs"
        sub="Upload co-registered aerial images of the same areas: one pair or a whole batch. Files are paired by the number in their names (00003_before / 00003_after, im1_00003 / im2_00003), otherwise in name order. The change-detection model runs on each pair and every result is matched against the indexed tiles."
      />

      <div className="upload-grid no-print">
        <DropZone label="Before" hint="Earlier acquisitions" files={befores} onFiles={setBefores} />
        <div className="upload-mid">
          <button
            type="button"
            className="icon-btn"
            onClick={() => {
              setBefores(afters);
              setAfters(befores);
            }}
            disabled={!befores.length && !afters.length}
            title="Swap before and after sets"
            aria-label="Swap before and after sets"
          >
            <Icon name="swap" />
          </button>
        </div>
        <DropZone label="After" hint="Later acquisitions" files={afters} onFiles={setAfters} />
      </div>

      {(befores.length > 0 || afters.length > 0) && !rows.length && (
        <Panel title={`${pairs.length} pair${pairs.length === 1 ? "" : "s"} ready`} sub="Check the pairing before running" className="no-print">
          {pairs.length > 0 && (
            <div className="table-wrap">
              <table className="dtable static">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Before</th>
                    <th>After</th>
                    <th>Paired by</th>
                  </tr>
                </thead>
                <tbody>
                  {pairs.map((p, i) => (
                    <tr key={`${p.before.name}-${p.after.name}`}>
                      <td className="mono muted">{String(i + 1).padStart(2, "0")}</td>
                      <td className="mono">{p.before.name}</td>
                      <td className="mono">{p.after.name}</td>
                      <td className={p.byName ? "ok-text" : "muted"}>{p.byName ? `Name · ${p.key}` : "Order"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {unpaired.length > 0 && (
            <Notice kind="warn">
              {unpaired.length} file{unpaired.length === 1 ? " has" : "s have"} no counterpart and will be skipped:{" "}
              <span className="mono">{unpaired.map((f) => f.name).join(", ")}</span>
            </Notice>
          )}
        </Panel>
      )}

      <div className="run-bar no-print">
        <div className="run-status">
          {!health ? (
            "Checking model status…"
          ) : ready ? (
            <>
              <span className="status-dot ok" />
              Model checkpoint ready · inference on <b className="mono">{health.device.toUpperCase()}</b>
              {busy && (
                <span className="muted">
                  {" "}
                  · {done.length + failed.length} / {rows.length} analyzed
                </span>
              )}
            </>
          ) : (
            <>
              <span className="status-dot bad" />
              No trained checkpoint at weights/best.pt yet. Analysis will be available once training finishes.
            </>
          )}
        </div>
        <div className="run-actions">
          {(befores.length > 0 || afters.length > 0 || rows.length > 0) && (
            <button type="button" className="btn ghost" onClick={reset}>
              {busy ? "Cancel" : "Clear"}
            </button>
          )}
          <button type="button" className="btn primary" onClick={run} disabled={!pairs.length || busy}>
            {busy
              ? `Analyzing… ${elapsed.toFixed(1)} s`
              : pairs.length > 1
                ? `Run change analysis on ${pairs.length} pairs`
                : "Run change analysis"}
          </button>
        </div>
      </div>
      {busy && (
        <div className="progress" aria-hidden="true">
          <span />
        </div>
      )}

      {err && <ErrorBox title="Analysis failed" detail={err} />}

      {many && (
        <>
          <div className="kpis kpis-4 no-print">
            <Stat label="Pairs analyzed" value={`${done.length} / ${rows.length}`} sub={failed.length ? `${failed.length} failed` : "all succeeded"} />
            <Stat label="Mean frame changed" value={fmtPct(meanPct, 2)} sub="across completed pairs" />
            <Stat
              label="Most changed pair"
              value={maxRow ? fmtPct(maxRow.result.record.changed_pct_of_frame, 2) : "—"}
              sub={maxRow ? maxRow.before.name : "—"}
              small
            />
            <Stat
              label="By level"
              value={levelCounts
                .filter((l) => l.n)
                .map((l) => `${l.n} ${l.label}`)
                .join(" · ") || "—"}
              sub="Severe ≥40% · High ≥25% · Moderate ≥10%"
              small
            />
          </div>
          <Panel
            title="Batch results"
            sub="Select a row to open its full assessment below"
            className="no-print"
            actions={
              <button type="button" className="btn" onClick={() => setPrintAll(true)} disabled={!done.length || busy || printAll}>
                <Icon name="print" size={14} /> Print all briefs ({done.length})
              </button>
            }
          >
            <BatchTable rows={rows} selected={selected} onSelect={setPicked} />
          </Panel>
        </>
      )}

      {rec && (
        <div className={`${busy && !many ? "stale" : ""}${printAll ? " no-print" : ""}`}>
          <Brief
            row={rows[selected]}
            index={selected}
            total={rows.length}
            actions={
              <button type="button" className="btn" onClick={() => window.print()}>
                <Icon name="print" size={14} /> Print brief
              </button>
            }
          >
            {res.similar?.length > 0 && (
              <Panel
                title="Indexed tiles with a similar change pattern"
                sub="Ranked by cosine similarity of the 36-cell transition signature"
                className="no-print"
              >
                <div className="grid">
                  {res.similar.map((r) => (
                    <PairCard key={r.pair_id} rec={r} onOpen={(id) => go(`/pair/${id}`)} />
                  ))}
                </div>
              </Panel>
            )}
          </Brief>
        </div>
      )}

      {printAll && (
        <div className="print-only print-all">
          {rows.map((row, i) => row.status === "done" && <Brief key={row.id} row={row} index={i} total={rows.length} />)}
        </div>
      )}
    </div>
  );
}
