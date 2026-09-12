import { useEffect, useRef, useState } from "react";
import { AssessmentBody, AssessmentSummary } from "../components/Assessment";
import { Compare } from "../components/Compare";
import { Icon } from "../components/Icons";
import { ErrorBox, LevelBadge, Notice, PageHead, PairCard, Panel, SourceBadge } from "../components/ui";
import { go, postForm, setNavList } from "../lib/hooks";

function DropZone({ label, hint, file, onFile }) {
  const input = useRef(null);
  const [over, setOver] = useState(false);
  const [url, setUrl] = useState(null);
  const [dims, setDims] = useState(null);

  useEffect(() => {
    setDims(null);
    if (!file) {
      setUrl(null);
      return undefined;
    }
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  const native = dims && dims[0] === 512 && dims[1] === 512;
  return (
    <div
      className={`drop${over ? " over" : ""}${file ? " has" : ""}`}
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
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
      aria-label={`${label} image: ${file ? file.name : "none selected"}`}
    >
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          if (e.target.files?.[0]) onFile(e.target.files[0]);
          e.target.value = "";
        }}
      />
      <div className="drop-head">
        <span className="eyebrow">{label}</span>
        <span className="muted small">{hint}</span>
      </div>
      {url ? (
        <>
          <img src={url} alt={`${label} preview`} onLoad={(e) => setDims([e.target.naturalWidth, e.target.naturalHeight])} />
          <div className="drop-meta mono">
            <span className="ellipsis">{file.name}</span>
            <span>{(file.size / 1024).toFixed(0)} KB</span>
            {dims && (
              <span className={native ? "ok-text" : "warn-text"}>
                {dims[0]}×{dims[1]}
                {native ? " ✓" : " · will resample"}
              </span>
            )}
          </div>
        </>
      ) : (
        <div className="drop-empty">
          <Icon name="image" size={30} />
          <b>Drop an image or click to browse</b>
          <span className="muted small">512 × 512 aerial RGB tiles match the training domain</span>
        </div>
      )}
    </div>
  );
}

export default function Analyze({ health }) {
  const [before, setBefore] = useState(null);
  const [after, setAfter] = useState(null);
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!busy) return undefined;
    const t0 = Date.now();
    const t = setInterval(() => setElapsed((Date.now() - t0) / 1000), 100);
    return () => clearInterval(t);
  }, [busy]);

  const run = () => {
    if (!before || !after) return;
    const fd = new FormData();
    fd.append("before", before);
    fd.append("after", after);
    setBusy(true);
    setErr(null);
    setElapsed(0);
    postForm("/api/analyze", fd)
      .then((r) => {
        setRes(r);
        setNavList(
          r.similar.map((s) => s.pair_id),
          "Similar to uploaded imagery",
        );
      })
      .catch((e) => setErr(e.message))
      .finally(() => setBusy(false));
  };
  const reset = () => {
    setBefore(null);
    setAfter(null);
    setRes(null);
    setErr(null);
  };

  const rec = res?.record;
  const ready = health?.checkpoint_exists;

  return (
    <div className="page">
      <PageHead
        eyebrow="Analyze imagery"
        title="Assess a new before / after pair"
        sub="Upload two co-registered aerial images of the same area. The change-detection model runs once, and the result is matched against every indexed tile."
      />

      <div className="upload-grid no-print">
        <DropZone label="Before" hint="Earlier acquisition" file={before} onFile={setBefore} />
        <div className="upload-mid">
          <button
            type="button"
            className="icon-btn"
            onClick={() => {
              setBefore(after);
              setAfter(before);
            }}
            disabled={!before && !after}
            title="Swap before and after"
            aria-label="Swap before and after"
          >
            <Icon name="swap" />
          </button>
        </div>
        <DropZone label="After" hint="Later acquisition" file={after} onFile={setAfter} />
      </div>

      <div className="run-bar no-print">
        <div className="run-status">
          {!health ? (
            "Checking model status…"
          ) : ready ? (
            <>
              <span className="status-dot ok" />
              Model checkpoint ready · inference on <b className="mono">{health.device.toUpperCase()}</b>
            </>
          ) : (
            <>
              <span className="status-dot bad" />
              No trained checkpoint at weights/best.pt yet. Analysis will be available once training finishes.
            </>
          )}
        </div>
        <div className="run-actions">
          {(before || after || res) && (
            <button type="button" className="btn ghost" onClick={reset} disabled={busy}>
              Clear
            </button>
          )}
          <button type="button" className="btn primary" onClick={run} disabled={!before || !after || busy}>
            {busy ? `Analyzing… ${elapsed.toFixed(1)} s` : "Run change analysis"}
          </button>
        </div>
      </div>
      {busy && (
        <div className="progress" aria-hidden="true">
          <span />
        </div>
      )}

      {err && <ErrorBox title="Analysis failed" detail={err} />}

      {rec && (
        <div className={busy ? "stale" : ""}>
          <div className="dossier-title">
            <div>
              <div className="eyebrow">Assessment · uploaded pair</div>
              <h1 className="mono">ANALYSIS {rec.pair_id.toUpperCase()}</h1>
              <div className="dossier-tags">
                <LevelBadge pct={rec.changed_pct_of_frame} />
                <SourceBadge rec={rec} />
              </div>
            </div>
            <div className="dossier-actions no-print">
              <button type="button" className="btn" onClick={() => window.print()}>
                <Icon name="print" size={14} /> Print brief
              </button>
            </div>
          </div>

          {res.ood_warning && <Notice kind="warn">{res.ood_note}</Notice>}

          <div className="dossier-grid">
            <Panel title="Imagery">
              <Compare rec={rec} />
            </Panel>
            <Panel title="Assessment">
              <AssessmentSummary rec={rec} />
            </Panel>
          </div>

          <AssessmentBody rec={rec} />

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
        </div>
      )}
    </div>
  );
}
