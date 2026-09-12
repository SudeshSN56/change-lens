import { useEffect, useState, useRef } from "react";
import "./theme.css";

const API = import.meta.env.VITE_API ?? "http://localhost:8000";
const media = (p) => (p?.startsWith("http") ? p : API + p);

const CLASS_COLOR = {
  "non-vegetated ground": "#808080",
  tree: "#00ff00",
  "low vegetation": "#008000",
  water: "#0000ff",
  buildings: "#800000",
  playgrounds: "#ff0000",
};

const FALLBACK_CHIPS = [
  "where did trees become buildings",
  "vegetation decreased",
  "urbanization in Shanghai",
  "tree loss over 10%",
  "changes in Chengdu",
  "most changed areas",
];

/* ------------------------------------------------------------------ atoms */
function SyntheticBadge({ meta }) {
  if (meta?.uploaded) return <span className="badge gt">UPLOADED</span>;
  if (!meta?.synthetic) return null;
  return <span className="badge synthetic">SYNTHETIC</span>;
}

function Card({ rec, onOpen }) {
  const t = rec.top_transitions?.[0];
  return (
    <div className="card" onClick={() => onOpen(rec.pair_id)}>
      <img src={media(rec.overlay)} alt={`change overlay for ${rec.pair_id}`} loading="lazy" />
      <div className="body">
        <div className="row1">
          <span className="pid">#{rec.pair_id}</span>
          <span className="pct">{rec.changed_pct_of_frame}% changed</span>
        </div>
        <div className="sub">
          {rec.metadata?.region ?? "uploaded"} · {rec.metadata?.date_before ?? "—"} →{" "}
          {rec.metadata?.date_after ?? "—"} <SyntheticBadge meta={rec.metadata} />
          {rec.similarity !== undefined && (
            <> · <b className="pct">{(rec.similarity * 100).toFixed(0)}% similar</b></>
          )}
        </div>
        {t && (
          <div className="sub" style={{ marginTop: 5 }}>
            <span className="sw" style={{ background: CLASS_COLOR[t.from] }} />
            {t.from} → <span className="sw" style={{ background: CLASS_COLOR[t.to] }} />
            {t.to}
          </div>
        )}
        <div className="desc">{rec.description}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ detail view */
function Detail({ pairId, onBack }) {
  const [rec, setRec] = useState(null);
  const [source, setSource] = useState("model");
  const [hasGt, setHasGt] = useState(false);

  useEffect(() => {
    const q = source === "gt" ? "?source=gt" : "";
    fetch(`${API}/api/pairs/${pairId}${q}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(setRec)
      .catch(() => setRec(null));
  }, [pairId, source]);

  useEffect(() => {
    fetch(`${API}/api/pairs/${pairId}?source=gt`).then((r) => setHasGt(r.ok));
  }, [pairId]);

  if (!rec) return <div className="spin">Loading #{pairId}…</div>;
  const m = rec.metadata ?? {};

  return (
    <div>
      <button className="back" onClick={onBack}>← Back</button>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>Pair #{rec.pair_id}</h2>
        <span className={`badge ${rec.source === "ground_truth" ? "gt" : "src"}`}>
          {rec.source === "ground_truth" ? "GROUND TRUTH" : "MODEL PREDICTION"}
        </span>
        {hasGt && (
          <div className="toggle" style={{ marginLeft: "auto" }}>
            <button className={source === "model" ? "on" : ""} onClick={() => setSource("model")}>
              Model
            </button>
            <button className={source === "gt" ? "on" : ""} onClick={() => setSource("gt")}>
              Ground truth
            </button>
          </div>
        )}
      </div>

      <div className="triptych">
        <figure>
          <img src={media(rec.image1)} alt="before" />
          <figcaption>Before · {m.date_before ?? "—"}</figcaption>
        </figure>
        <figure>
          <img src={media(rec.image2)} alt="after" />
          <figcaption>After · {m.date_after ?? "—"}</figcaption>
        </figure>
        <figure>
          <img src={media(rec.overlay)} alt="change overlay" />
          <figcaption>Change overlay · coloured by what it became</figcaption>
        </figure>
      </div>

      <div className="section">
        <h3>Summary</h3>
        <p className="prose">{rec.description}</p>
      </div>

      <div className="section">
        <h3>Land cover within the changed area</h3>
        {/* The denominator line is mandatory: these are shares of the changed
            region, not of the frame, and the table is misleading without it. */}
        <div className="denominator">
          Percentages below are shares of the <b>changed area only</b> —{" "}
          <b>{rec.changed_px.toLocaleString()} px</b>, which is{" "}
          <b>{rec.changed_pct_of_frame}%</b> of the 512×512 frame. SECOND labels land
          cover only inside changed regions.
          {rec.same_category_px > 0 && (
            <>
              {" "}
              <b>{rec.same_category_px.toLocaleString()} px</b> changed in appearance
              but stayed in the same category.
            </>
          )}
        </div>
        <table className="cat">
          <thead>
            <tr>
              <th>Category</th><th>Before</th><th>After</th>
              <th>Δ (pp)</th><th>Relative</th>
            </tr>
          </thead>
          <tbody>
            {rec.per_category.map((c) => (
              <tr key={c.class}>
                <td>
                  <span className="sw" style={{ background: CLASS_COLOR[c.class] }} />
                  {c.class}
                </td>
                <td>{c.pct_before.toFixed(2)}%</td>
                <td>{c.pct_after.toFixed(2)}%</td>
                <td className={c.delta_pp > 0 ? "up" : c.delta_pp < 0 ? "down" : "na"}>
                  {c.delta_pp > 0 ? "+" : ""}{c.delta_pp.toFixed(2)}
                </td>
                {/* null relative_pct renders as "new" or "—", never a number */}
                <td className={c.relative_pct === null ? "na" : c.relative_pct > 0 ? "up" : "down"}>
                  {c.relative_pct === null
                    ? c.pct_after > 0 ? "new" : "—"
                    : `${c.relative_pct > 0 ? "+" : ""}${c.relative_pct.toFixed(1)}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rec.top_transitions?.length > 0 && (
        <div className="section">
          <h3>Top transitions</h3>
          <ul className="translist">
            {rec.top_transitions.map((t, i) => (
              <li key={i}>
                <span className="sw" style={{ background: CLASS_COLOR[t.from] }} />
                {t.from}
                <span className="muted">→</span>
                <span className="sw" style={{ background: CLASS_COLOR[t.to] }} />
                {t.to}
                <span className="px">{t.px.toLocaleString()} px · {t.pct_of_frame}% of frame</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="section">
        <h3>Metadata</h3>
        <div className="meta">
          <div><div className="k">Region</div><div className="v">{m.region ?? "—"}</div></div>
          <div>
            <div className="k">Coordinates</div>
            <div className="v">
              {m.lat !== undefined ? `${m.lat}, ${m.lon}` : "—"} <SyntheticBadge meta={m} />
            </div>
          </div>
          <div><div className="k">Before</div><div className="v">{m.date_before ?? "—"}</div></div>
          <div><div className="k">After</div><div className="v">{m.date_after ?? "—"}</div></div>
          <div><div className="k">Platform</div><div className="v">{m.satellite ?? "—"}</div></div>
        </div>
        {m.synthetic && (
          <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
            SECOND ships without per-pair geolocation, dates or sensor information.
            The city is the real capture region; the precise point, dates and platform
            are generated deterministically from the pair id and are clearly fictional.
          </p>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- query view */
function QueryView({ onOpen }) {
  const [text, setText] = useState("");
  const [chips, setChips] = useState(FALLBACK_CHIPS);
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`${API}/api/examples`)
      .then((r) => r.json())
      .then((d) => d.examples?.length && setChips(d.examples))
      .catch(() => {});
  }, []);

  const run = (q) => {
    const t = (q ?? text).trim();
    if (!t) return;
    setText(t);
    setBusy(true);
    fetch(`${API}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: t, limit: 12 }),
    })
      .then((r) => r.json())
      .then(setRes)
      .catch(() => setRes({ results: [], error: true }))
      .finally(() => setBusy(false));
  };

  return (
    <div>
      <div className="searchrow">
        <input
          value={text}
          placeholder="Ask about the change — e.g. where did trees become buildings"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run()}
        />
        <button onClick={() => run()} disabled={busy}>{busy ? "…" : "Search"}</button>
      </div>

      <div className="chips">
        {chips.map((c) => (
          <button key={c} className="chip" onClick={() => run(c)}>{c}</button>
        ))}
      </div>

      {res && (
        <>
          <div className="parsed">
            <span className="lbl">Read as:</span>
            <code>{res.parsed_summary}</code>
          </div>
          {res.relaxed && <div className="relaxed">{res.note}</div>}
          <div className="muted" style={{ margin: "14px 0 12px", fontSize: 13 }}>
            {res.count} result{res.count === 1 ? "" : "s"}
          </div>
          <div className="grid">
            {res.results?.map((r) => <Card key={r.pair_id} rec={r} onOpen={onOpen} />)}
          </div>
        </>
      )}

      {!res && (
        <div className="center muted">
          Pick an example above, or type a question.<br />
          Search runs entirely over a precomputed index — no inference, no waiting.
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------- gallery view */
function Gallery({ onOpen }) {
  const [data, setData] = useState(null);
  const [offset, setOffset] = useState(0);
  const LIMIT = 60;

  useEffect(() => {
    fetch(`${API}/api/pairs?limit=${LIMIT}&offset=${offset}`)
      .then((r) => r.json())
      .then(setData);
  }, [offset]);

  if (!data) return <div className="spin">Loading gallery…</div>;

  return (
    <div>
      <div className="muted" style={{ marginBottom: 14, fontSize: 13 }}>
        {data.total} held-out pairs, sorted by how much changed. Showing{" "}
        {offset + 1}–{Math.min(offset + LIMIT, data.total)}.
      </div>
      <div className="grid">
        {data.results.map((r) => <Card key={r.pair_id} rec={r} onOpen={onOpen} />)}
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 24 }}>
        <button className="back" disabled={offset === 0}
          onClick={() => setOffset(Math.max(0, offset - LIMIT))}>← Previous</button>
        <button className="back" disabled={offset + LIMIT >= data.total}
          onClick={() => setOffset(offset + LIMIT)}>Next →</button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ upload view */
function DropZone({ tag, file, onFile }) {
  const ref = useRef();
  const [over, setOver] = useState(false);
  return (
    <div
      className={`drop${over ? " over" : ""}`}
      onClick={() => ref.current.click()}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault(); setOver(false);
        if (e.dataTransfer.files?.[0]) onFile(e.dataTransfer.files[0]);
      }}
    >
      <input ref={ref} type="file" accept="image/*" hidden
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      <div className="tag">{tag}</div>
      {file ? <img src={URL.createObjectURL(file)} alt={tag} />
            : <div>Click or drop an image</div>}
    </div>
  );
}

function Upload({ onOpen }) {
  const [before, setBefore] = useState(null);
  const [after, setAfter] = useState(null);
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const run = () => {
    if (!before || !after) return;
    const fd = new FormData();
    fd.append("before", before);
    fd.append("after", after);
    setBusy(true); setErr(null);
    fetch(`${API}/api/analyze`, { method: "POST", body: fd })
      .then(async (r) => (r.ok ? r.json() : Promise.reject((await r.json()).detail)))
      .then(setRes)
      .catch((e) => setErr(String(e)))
      .finally(() => setBusy(false));
  };

  const rec = res?.record;
  return (
    <div>
      <div className="drops">
        <DropZone tag="Before" file={before} onFile={setBefore} />
        <DropZone tag="After" file={after} onFile={setAfter} />
      </div>
      <div style={{ textAlign: "center", margin: "20px 0" }}>
        <button className="chip" style={{ padding: "10px 30px" }}
          onClick={run} disabled={!before || !after || busy}>
          {busy ? "Analyzing…" : "Analyze pair"}
        </button>
      </div>

      {err && <div className="ood">{err}</div>}
      {res?.ood_warning && <div className="ood">⚠ {res.ood_note}</div>}

      {rec && (
        <>
          <div className="triptych">
            <figure><img src={media(rec.image1)} alt="before" /><figcaption>Before</figcaption></figure>
            <figure><img src={media(rec.image2)} alt="after" /><figcaption>After</figcaption></figure>
            <figure><img src={media(rec.overlay)} alt="overlay" /><figcaption>Change overlay</figcaption></figure>
          </div>

          <div className="section">
            <h3>Summary</h3>
            <p className="prose">{rec.description}</p>
          </div>

          <div className="section">
            <h3>Land cover within the changed area</h3>
            <div className="denominator">
              Shares of the <b>changed area only</b> — <b>{rec.changed_px.toLocaleString()} px</b>,{" "}
              <b>{rec.changed_pct_of_frame}%</b> of the frame.
            </div>
            <table className="cat">
              <thead>
                <tr><th>Category</th><th>Before</th><th>After</th><th>Δ (pp)</th><th>Relative</th></tr>
              </thead>
              <tbody>
                {rec.per_category.map((c) => (
                  <tr key={c.class}>
                    <td><span className="sw" style={{ background: CLASS_COLOR[c.class] }} />{c.class}</td>
                    <td>{c.pct_before.toFixed(2)}%</td>
                    <td>{c.pct_after.toFixed(2)}%</td>
                    <td className={c.delta_pp > 0 ? "up" : c.delta_pp < 0 ? "down" : "na"}>
                      {c.delta_pp > 0 ? "+" : ""}{c.delta_pp.toFixed(2)}
                    </td>
                    <td className={c.relative_pct === null ? "na" : c.relative_pct > 0 ? "up" : "down"}>
                      {c.relative_pct === null ? (c.pct_after > 0 ? "new" : "—")
                        : `${c.relative_pct > 0 ? "+" : ""}${c.relative_pct.toFixed(1)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {res.similar?.length > 0 && (
            <div className="section">
              <h3>Similar changes found in the database</h3>
              <div className="grid">
                {res.similar.map((r) => <Card key={r.pair_id} rec={r} onOpen={onOpen} />)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------- app */
export default function App() {
  const [view, setView] = useState("query");
  const [pairId, setPairId] = useState(null);
  const [health, setHealth] = useState(null);

  useEffect(() => {
    fetch(`${API}/api/health`).then((r) => r.json()).then(setHealth).catch(() => {});
  }, []);

  const open = (id) => { setPairId(id); setView("detail"); };
  const go = (v) => { setPairId(null); setView(v); };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">Change<span>Lens</span></div>
        <div className="health">
          {health
            ? <>
                <b>{health.n_records}</b> held-out pairs indexed ·{" "}
                source <b>{health.index_source === "model" ? "model" : "ground truth"}</b> ·{" "}
                {health.device}
              </>
            : "connecting to API…"}
        </div>
        <nav className="nav">
          {["query", "gallery", "upload"].map((v) => (
            <button key={v} className={view === v ? "on" : ""} onClick={() => go(v)}>
              {v[0].toUpperCase() + v.slice(1)}
            </button>
          ))}
        </nav>
      </header>

      {view === "query" && <QueryView onOpen={open} />}
      {view === "gallery" && <Gallery onOpen={open} />}
      {view === "upload" && <Upload onOpen={open} />}
      {view === "detail" && <Detail pairId={pairId} onBack={() => go("query")} />}
    </div>
  );
}
