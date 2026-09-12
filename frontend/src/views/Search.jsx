import { useEffect, useState } from "react";
import { Icon } from "../components/Icons";
import { ErrorBox, Notice, PageHead, PairCard, PairTable, Panel, Segmented } from "../components/ui";
import { CLASS_BY_IDX } from "../lib/constants";
import { go, postJSON, setNavList, useJSON, useStoredState } from "../lib/hooks";

const FALLBACK = [
  "where did trees become buildings",
  "vegetation decreased",
  "urbanization in Shanghai",
  "tree loss over 10%",
  "changes in Chengdu",
  "most changed areas",
];

const PATTERNS = [
  ["Category change", "vegetation decreased"],
  ["Growth", "where buildings increased"],
  ["Size threshold", "tree loss over 10%"],
  ["Transition", "trees became buildings"],
  ["Conversion", "vegetation converted to bare ground"],
  ["Sector", "changes in Chengdu"],
  ["Radius", "within 20 km of 30.28, 120.15"],
  ["Date window", "between 2015 and 2018"],
  ["Ranking", "most changed areas"],
  ["Named activity", "urbanization"],
];

function tokensOf(f) {
  const names = (ids) => ids.map((i) => CLASS_BY_IDX[i]?.short ?? i).join(" / ");
  const t = [];
  if (f.transition) t.push(["Transition", `${names(f.transition[0])} → ${names(f.transition[1])}`]);
  else if (f.categories?.length) t.push(["Category", names(f.categories)]);
  if (f.direction) t.push(["Direction", f.direction]);
  if (f.threshold != null) t.push(["Threshold", `≥ ${f.threshold}${f.threshold_kind === "relative" ? "% relative" : " pp"}`]);
  if (f.region) t.push(["Sector", f.region]);
  if (f.center) t.push(["Radius", `${f.radius_km ?? 25} km of ${f.center[0].toFixed(3)}, ${f.center[1].toFixed(3)}`]);
  if (f.date_before_range) t.push(["Before image", `${f.date_before_range[0].slice(0, 4)}–${f.date_before_range[1].slice(0, 4)}`]);
  if (f.date_after_range) t.push(["After image", `${f.date_after_range[0].slice(0, 4)}–${f.date_after_range[1].slice(0, 4)}`]);
  if (f.sort && f.sort !== "relevance") t.push(["Sort", "most changed first"]);
  if (f.matched_alias) t.push(["Alias", f.matched_alias]);
  return t;
}

export default function Search({ params }) {
  const q = params.get("q") ?? "";
  const [text, setText] = useState(q);
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [view, setView] = useStoredState("cl.search.view", "grid");
  const [history, setHistory] = useStoredState("cl.search.history", []);
  const examples = useJSON("/api/examples");

  useEffect(() => {
    setText(q);
    if (!q) {
      setRes(null);
      return undefined;
    }
    let alive = true;
    setBusy(true);
    setErr(null);
    const t0 = performance.now();
    postJSON("/api/query", { text: q, limit: 24 })
      .then((r) => {
        if (!alive) return;
        setRes({ ...r, ms: performance.now() - t0 });
        setNavList(
          r.results.map((x) => x.pair_id),
          `Query: ${q}`,
        );
        setHistory((h) => [q, ...h.filter((x) => x !== q)].slice(0, 6));
      })
      .catch((e) => alive && setErr(e.message))
      .finally(() => alive && setBusy(false));
    return () => {
      alive = false;
    };
  }, [q, setHistory]);

  const submit = (value) => {
    const s = (value ?? text).trim();
    if (s) go(`/search?q=${encodeURIComponent(s)}`);
  };
  const open = (id) => go(`/pair/${id}`);
  const tokens = res ? tokensOf(res.parsed_filter) : [];

  return (
    <div className="page">
      <PageHead
        eyebrow="Natural-language query"
        title="Ask the index a question"
        sub="Queries are parsed by transparent rules, not a black box. The interpretation is shown with every answer, so every result can be explained."
      />

      <form
        className="cmd"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Icon name="search" size={18} />
        <input
          id="q"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. where did trees become buildings in Hangzhou"
          autoComplete="off"
          spellCheck={false}
          aria-label="Query"
        />
        {text && (
          <button type="button" className="icon-btn" onClick={() => setText("")} aria-label="Clear query">
            <Icon name="x" />
          </button>
        )}
        <kbd className="cmd-kbd" title="Press / anywhere to focus">
          /
        </kbd>
        <button className="btn primary" disabled={busy || !text.trim()}>
          {busy ? "Searching…" : "Run query"}
        </button>
      </form>

      <div className="chips">
        <span className="chips-label">Examples</span>
        {(examples.data?.examples ?? FALLBACK).map((c) => (
          <button key={c} type="button" className="chip" onClick={() => submit(c)}>
            {c}
          </button>
        ))}
      </div>
      {history.length > 0 && (
        <div className="chips">
          <span className="chips-label">Recent</span>
          {history.map((c) => (
            <button key={c} type="button" className="chip ghost" onClick={() => submit(c)}>
              {c}
            </button>
          ))}
          <button type="button" className="link-btn" onClick={() => setHistory([])}>
            Clear
          </button>
        </div>
      )}

      {err && <ErrorBox title="Query failed" detail={err} />}

      {res && (
        <div className={busy ? "stale" : ""}>
          <div className="interp">
            <div className="interp-head">
              <span className="eyebrow">Interpreted as</span>
              <span className="mono small muted">
                {res.count} result{res.count === 1 ? "" : "s"} · {Math.round(res.ms)} ms · precomputed index, no inference
              </span>
            </div>
            <div className="tokens">
              {tokens.length ? (
                tokens.map(([k, v]) => (
                  <span className="token" key={k}>
                    <span>{k}</span>
                    <b>{v}</b>
                  </span>
                ))
              ) : (
                <span className="token">
                  <span>Constraints</span>
                  <b>none — most changed tiles</b>
                </span>
              )}
            </div>
            <code className="interp-raw">{res.parsed_summary}</code>
          </div>

          {res.relaxed && <Notice kind="warn">{res.note}</Notice>}

          <div className="results-bar">
            <h2 className="h2">Results</h2>
            <Segmented
              size="sm"
              label="Result layout"
              value={view}
              onChange={setView}
              options={[
                { value: "grid", label: "Cards", icon: "grid" },
                { value: "list", label: "Table", icon: "list" },
              ]}
            />
          </div>
          {view === "grid" ? (
            <div className="grid">
              {res.results.map((r) => (
                <PairCard key={r.pair_id} rec={r} onOpen={open} />
              ))}
            </div>
          ) : (
            <Panel flush>
              <PairTable rows={res.results} onOpen={open} ranked />
            </Panel>
          )}
        </div>
      )}

      {!res && !err && (
        <Panel title="What you can ask" sub="The parser understands these ten patterns, and combinations of them. Select one to run it.">
          <div className="guide">
            {PATTERNS.map(([label, example]) => (
              <button key={label} type="button" className="guide-card" onClick={() => submit(example)}>
                <span>{label}</span>
                <b>“{example}”</b>
              </button>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
