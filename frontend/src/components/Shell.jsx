import { useEffect, useState } from "react";
import { CLASSES, fmtInt } from "../lib/constants";
import { Icon } from "./Icons";
import { Swatch } from "./ui";

const NAV = [
  { key: "", label: "Situation overview", icon: "overview", href: "#/" },
  { key: "search", label: "Query", icon: "search", href: "#/search", kbd: "/" },
  { key: "explore", label: "Tile explorer", icon: "grid", href: "#/explore" },
  { key: "analyze", label: "Analyze imagery", icon: "upload", href: "#/analyze" },
];

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const iso = now.toISOString();
  return (
    <span className="mono" title="Coordinated Universal Time">
      {iso.slice(0, 10)} <b>{iso.slice(11, 19)}Z</b>
    </span>
  );
}

export function Shell({ page, health, online, children }) {
  const sourceLabel =
    health?.index_source === "model" ? "Model predictions" : health?.index_source === "ground_truth" ? "Ground truth" : "None";
  return (
    <div className="app">
      <div className="banner" role="note">
        <span className="banner-dot" />
        Demonstration system · SECOND aerial dataset · coordinates, dates and platform are synthetic
      </div>
      <div className="shell">
        <aside className="sidebar">
          <a className="brand" href="#/">
            <span className="brand-mark">
              <Icon name="radar" size={20} />
            </span>
            <span>
              <b>CHANGE LENS</b>
              <small>Change intelligence console</small>
            </span>
          </a>

          <nav className="nav" aria-label="Primary">
            {NAV.map((n) => (
              <a key={n.key} href={n.href} className={page === n.key ? "on" : ""} aria-current={page === n.key ? "page" : undefined}>
                <Icon name={n.icon} />
                <span>{n.label}</span>
                {n.kbd && <kbd>{n.kbd}</kbd>}
              </a>
            ))}
          </nav>

          <div className="side-section">
            <div className="side-title">Change map legend</div>
            <ul className="legend">
              {CLASSES.map((c) => (
                <li key={c.idx}>
                  <Swatch color={c.color} />
                  {c.name}
                </li>
              ))}
            </ul>
            <p className="side-note">Changed areas are coloured by what the land became. Unchanged ground is greyscale.</p>
          </div>

          <div className="side-foot mono">
            <div>
              <span>MODEL</span>Siamese ResNet U-Net
            </div>
            <div>
              <span>INDEX</span>
              {health ? `${fmtInt(health.n_records)} held-out pairs` : "—"}
            </div>
            <div>
              <span>SEARCH</span>Rules, no inference
            </div>
          </div>
        </aside>

        <div className="main">
          <header className="topbar">
            <div className={`link ${online ? "up" : online === false ? "down" : ""}`}>
              <span className="link-dot" />
              {online ? "API link up" : online === false ? "API link down" : "Connecting"}
            </div>
            {health && (
              <>
                <div className="tb-item">
                  <span>Index</span>
                  <b>{sourceLabel}</b>
                </div>
                <div className="tb-item">
                  <span>Tiles</span>
                  <b className="mono">{fmtInt(health.n_records)}</b>
                </div>
                <div className="tb-item">
                  <span>Compute</span>
                  <b className="mono">{health.device.toUpperCase()}</b>
                </div>
                <div className="tb-item">
                  <span>Checkpoint</span>
                  <b className={health.checkpoint_exists ? "" : "warn-text"}>{health.checkpoint_exists ? "Ready" : "Missing"}</b>
                </div>
              </>
            )}
            <div className="tb-spacer" />
            <div className="tb-clock">
              <Clock />
            </div>
          </header>
          <main className="content">{children}</main>
        </div>
      </div>
    </div>
  );
}
