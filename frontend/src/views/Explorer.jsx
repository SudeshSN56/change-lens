import { useEffect, useMemo, useState } from "react";
import { ErrorBox, Loading, PageHead, PairCard, PairTable, Panel, Segmented } from "../components/ui";
import { ACTIVITIES, CITIES, LEVELS, fmtInt, levelOf, primaryActivityKey } from "../lib/constants";
import { go, setNavList, useJSON, useStoredState } from "../lib/hooks";

const PAGE = 48;
const ALL_LEVELS = LEVELS.map((l) => l.key);

const SORTS = {
  change_desc: (a, b) => b.changed_pct_of_frame - a.changed_pct_of_frame,
  change_asc: (a, b) => a.changed_pct_of_frame - b.changed_pct_of_frame,
  id: (a, b) => a.pair_id.localeCompare(b.pair_id),
  recent: (a, b) => (b.metadata?.date_after ?? "").localeCompare(a.metadata?.date_after ?? ""),
};

export default function Explorer() {
  const all = useJSON("/api/pairs?limit=5000&sort=changed_pct");
  const [region, setRegion] = useStoredState("cl.ex.region", "all");
  const [levels, setLevels] = useStoredState("cl.ex.levels", ALL_LEVELS);
  const [activity, setActivity] = useStoredState("cl.ex.activity", "all");
  const [sort, setSort] = useStoredState("cl.ex.sort", "change_desc");
  const [view, setView] = useStoredState("cl.ex.view", "grid");
  const [idq, setIdq] = useState("");
  const [shown, setShown] = useState(PAGE);

  const records = all.data?.results;

  // Everything except the level filter, so the level toggles can show live counts.
  const base = useMemo(() => {
    const needle = idq.trim();
    return (records ?? []).filter(
      (r) =>
        (region === "all" || r.metadata?.region === region) &&
        (activity === "all" || primaryActivityKey(r) === activity) &&
        (!needle || r.pair_id.includes(needle)),
    );
  }, [records, region, activity, idq]);

  const levelCounts = useMemo(() => {
    const c = Object.fromEntries(ALL_LEVELS.map((k) => [k, 0]));
    base.forEach((r) => {
      c[levelOf(r.changed_pct_of_frame).key] += 1;
    });
    return c;
  }, [base]);

  const rows = useMemo(
    () => base.filter((r) => levels.includes(levelOf(r.changed_pct_of_frame).key)).sort(SORTS[sort] ?? SORTS.change_desc),
    [base, levels, sort],
  );

  useEffect(() => setShown(PAGE), [region, levels, activity, sort, idq]);

  const filtered = region !== "all" || activity !== "all" || idq || levels.length !== ALL_LEVELS.length;
  const reset = () => {
    setRegion("all");
    setActivity("all");
    setLevels(ALL_LEVELS);
    setIdq("");
  };
  const toggleLevel = (k) => setLevels((ls) => (ls.includes(k) ? ls.filter((x) => x !== k) : [...ls, k]));
  const open = (id) => {
    setNavList(
      rows.map((r) => r.pair_id),
      "Tile explorer",
    );
    go(`/pair/${id}`);
  };

  if (all.error) return <ErrorBox title="Could not load tiles" detail={all.error} />;
  if (!records) return <Loading label="Loading tile index" />;

  const page = rows.slice(0, shown);

  return (
    <div className="page">
      <PageHead
        eyebrow="Tile explorer"
        title="Browse every monitored tile"
        sub={`${fmtInt(all.data.total)} held-out tile pairs. Filter by sector, change level and primary activity.`}
      />

      <div className="filters">
        <label className="field">
          <span>Tile id</span>
          <input value={idq} onChange={(e) => setIdq(e.target.value)} placeholder="e.g. 00421" inputMode="numeric" />
        </label>
        <div className="field">
          <span>Sector</span>
          <Segmented
            label="Sector"
            value={region}
            onChange={setRegion}
            options={[{ value: "all", label: "All" }, ...CITIES.map((c) => ({ value: c.name, label: c.name }))]}
          />
        </div>
        <div className="field">
          <span>Change level</span>
          <div className="lvl-toggles" role="group" aria-label="Change level">
            {LEVELS.map((l) => (
              <button
                key={l.key}
                type="button"
                className={levels.includes(l.key) ? "on" : ""}
                aria-pressed={levels.includes(l.key)}
                onClick={() => toggleLevel(l.key)}
                title={`≥ ${l.min}% of frame changed`}
              >
                <i style={{ background: l.color }} />
                {l.label}
                <b className="mono">{levelCounts[l.key]}</b>
              </button>
            ))}
          </div>
        </div>
        <label className="field">
          <span>Primary activity</span>
          <select value={activity} onChange={(e) => setActivity(e.target.value)}>
            <option value="all">All activity</option>
            {ACTIVITIES.map((a) => (
              <option key={a.key} value={a.key}>
                {a.label}
              </option>
            ))}
            <option value="none">No change detected</option>
          </select>
        </label>
        <label className="field">
          <span>Sort</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="change_desc">Most changed first</option>
            <option value="change_asc">Least changed first</option>
            <option value="recent">Latest after-image first</option>
            <option value="id">Tile id</option>
          </select>
        </label>
        <div className="field">
          <span>View</span>
          <Segmented
            label="Layout"
            value={view}
            onChange={setView}
            options={[
              { value: "grid", label: "Cards", icon: "grid" },
              { value: "list", label: "Table", icon: "list" },
            ]}
          />
        </div>
      </div>

      <div className="results-bar">
        <span className="muted">
          Showing <b className="mono">{page.length}</b> of <b className="mono">{rows.length}</b> matching tiles
        </span>
        {filtered && (
          <button type="button" className="link-btn" onClick={reset}>
            Reset filters
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <Panel>
          <p className="muted">No tiles match these filters.</p>
        </Panel>
      ) : view === "grid" ? (
        <div className="grid">
          {page.map((r) => (
            <PairCard key={r.pair_id} rec={r} onOpen={open} />
          ))}
        </div>
      ) : (
        <Panel flush>
          <PairTable rows={page} onOpen={open} />
        </Panel>
      )}

      {shown < rows.length && (
        <div className="more">
          <button type="button" className="btn" onClick={() => setShown((s) => s + PAGE)}>
            Load {Math.min(PAGE, rows.length - shown)} more
          </button>
        </div>
      )}
    </div>
  );
}
