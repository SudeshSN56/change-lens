import { useMemo } from "react";
import { BarList, Histogram, LevelStack, SectorMap } from "../components/charts";
import { ErrorBox, LevelLegend, Loading, Notice, PageHead, PairTable, Panel, Stat, SyntheticTag } from "../components/ui";
import { CITIES, LEVELS, activityTotals, fmtInt, fmtPct, levelOf } from "../lib/constants";
import { go, setNavList, useJSON } from "../lib/hooks";

const zeroLevels = () => Object.fromEntries(LEVELS.map((l) => [l.key, 0]));

function summarize(s) {
  if (!s) return null;
  const pcts = s.points.map((p) => p.pct);
  const n = pcts.length;
  const sorted = [...pcts].sort((a, b) => a - b);
  const mean = n ? pcts.reduce((a, b) => a + b, 0) / n : 0;
  const median = n ? (n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2) : 0;
  const levels = zeroLevels();
  s.points.forEach((p) => {
    levels[levelOf(p.pct).key] += 1;
  });
  const regions = CITIES.map((c) => {
    const ps = s.points.filter((p) => p.region === c.name);
    const lv = zeroLevels();
    ps.forEach((p) => {
      lv[levelOf(p.pct).key] += 1;
    });
    return {
      name: c.name,
      n: ps.length,
      mean: ps.length ? ps.reduce((a, p) => a + p.pct, 0) / ps.length : 0,
      levels: lv,
    };
  });
  const acts = activityTotals(s.transition_matrix);
  const totalPx = acts.reduce((a, b) => a + b.px, 0);
  const dominant = [...acts].sort((a, b) => b.px - a.px)[0];
  return { n, mean, median, levels, regions, acts, totalPx, dominant, pcts, points: s.points, source: s.source };
}

export default function Overview() {
  const stats = useJSON("/api/stats");
  const top = useJSON("/api/pairs?limit=10&sort=changed_pct");
  const d = useMemo(() => summarize(stats.data), [stats.data]);

  if (stats.error && !d) {
    return (
      <ErrorBox
        title="Cannot reach the analysis API"
        detail={stats.error}
        hint="Start it with: .venv/Scripts/python.exe -m uvicorn api:app --app-dir src --port 8000"
      />
    );
  }
  if (!d) return <Loading label="Compiling situation overview" />;

  const priority = d.levels.severe + d.levels.high;
  const actRows = d.acts
    .filter((a) => a.px > 0)
    .sort((a, b) => b.px - a.px)
    .map((a) => ({
      key: a.key,
      label: a.label,
      value: a.px,
      display: fmtPct((100 * a.px) / d.totalPx),
      query: a.query,
      selectable: Boolean(a.query),
      tip: (
        <>
          <b>{a.label}</b>
          <div>{fmtInt(a.px)} changed pixels across the index</div>
          {a.query && <div className="muted">Click to query “{a.query}”</div>}
        </>
      ),
    }));

  const openTop = (id) => {
    setNavList(top.data?.results.map((r) => r.pair_id) ?? [], "Priority watchlist");
    go(`/pair/${id}`);
  };
  const openPoint = (id) => {
    setNavList(
      [...d.points].sort((a, b) => b.pct - a.pct).map((p) => p.pair_id),
      "All tiles by change",
    );
    go(`/pair/${id}`);
  };

  return (
    <div className="page">
      <PageHead
        eyebrow="Situation overview"
        title="Change activity across monitored sectors"
        sub={`${fmtInt(d.n)} held-out aerial tile pairs from three sectors. None of these tiles were used to train the model.`}
      />

      {d.source === "ground_truth" && (
        <Notice kind="info">
          The model index has not been built yet, so this overview is showing <b>ground-truth labels</b>.
        </Notice>
      )}

      <div className="kpis kpis-4">
        <Stat label="Tiles under watch" value={fmtInt(d.n)} sub="Hangzhou · Chengdu · Shanghai" />
        <Stat
          label="Priority tiles"
          value={fmtInt(priority)}
          sub={
            <>
              <span className="lvl-dot" style={{ background: LEVELS[0].color }} />
              {d.levels.severe} severe · <span className="lvl-dot" style={{ background: LEVELS[1].color }} />
              {d.levels.high} high
            </>
          }
        />
        <Stat label="Mean change per tile" value={fmtPct(d.mean)} sub={`Median ${fmtPct(d.median)} of frame`} />
        <Stat
          label="Dominant activity"
          value={d.dominant?.label ?? "—"}
          sub={d.dominant ? `${fmtPct((100 * d.dominant.px) / d.totalPx)} of all changed pixels` : ""}
          small
        />
      </div>

      <div className="cols cols-2-1">
        <Panel
          title="Priority watchlist"
          sub="Tiles with the largest share of frame changed"
          actions={
            <a className="btn sm" href="#/explore">
              Open explorer
            </a>
          }
          flush
        >
          {top.data ? <PairTable rows={top.data.results} onOpen={openTop} ranked /> : <Loading label="Loading watchlist" />}
        </Panel>
        <Panel title="Activity breakdown" sub="Share of all changed pixels by transition type. Select a row to query it.">
          <BarList rows={actRows} onSelect={(r) => go(`/search?q=${encodeURIComponent(r.query)}`)} />
        </Panel>
      </div>

      <Panel
        title="Sector plot"
        sub="Each dot is one tile, coloured by change level. Hover to inspect, click to open. Positions are synthetic."
        actions={
          <>
            <LevelLegend counts={d.levels} />
            <SyntheticTag force />
          </>
        }
      >
        <SectorMap points={d.points} onOpen={openPoint} />
      </Panel>

      <div className="cols cols-2">
        <Panel title="Change level distribution" sub="Tiles by share of frame changed, in 5% bins">
          <Histogram values={d.pcts} />
          <LevelLegend counts={d.levels} />
        </Panel>
        <Panel title="Sector summary" sub="Select a sector to query its changes" flush>
          <div className="table-wrap">
            <table className="dtable">
              <thead>
                <tr>
                  <th>Sector</th>
                  <th className="num">Tiles</th>
                  <th className="num">Mean</th>
                  <th className="num">Priority</th>
                  <th className="wide">Level mix</th>
                </tr>
              </thead>
              <tbody>
                {d.regions.map((r) => {
                  const open = () => go(`/search?q=${encodeURIComponent(`changes in ${r.name}`)}`);
                  return (
                    <tr key={r.name} tabIndex={0} onClick={open} onKeyDown={(e) => e.key === "Enter" && open()}>
                      <td className="strong">{r.name}</td>
                      <td className="num mono">{r.n}</td>
                      <td className="num mono">{fmtPct(r.mean)}</td>
                      <td className="num mono">{r.levels.severe + r.levels.high}</td>
                      <td className="wide">
                        <LevelStack counts={r.levels} total={r.n} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </div>
  );
}
