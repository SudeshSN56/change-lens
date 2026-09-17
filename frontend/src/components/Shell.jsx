import { useEffect, useState } from "react";
import { CLASSES, fmtInt } from "../lib/constants";
import { hasRole, signOut } from "../lib/auth";
import { useTheme } from "../lib/hooks";
import { Icon } from "./Icons";
import { Swatch } from "./ui";

const NAV = [
  { key: "", label: "Situation overview", icon: "overview", href: "#/" },
  { key: "search", label: "Query", icon: "search", href: "#/search", kbd: "/" },
  { key: "explore", label: "Tile explorer", icon: "grid", href: "#/explore" },
  { key: "analyze", label: "Analyze imagery", icon: "upload", href: "#/analyze", role: "analyst" },
  { key: "users", label: "User accounts", icon: "users", href: "#/users", role: "admin" },
];

function logout() {
  signOut();
  window.location.hash = "/";
}

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

export function Shell({ page, health, online, user, children }) {
  const [theme, toggleTheme] = useTheme();
  const nav = NAV.filter((n) => !n.role || hasRole(n.role, user));
  const sourceLabel =
    health?.index_source === "model" ? "Model predictions" : health?.index_source === "ground_truth" ? "Ground truth" : "None";
  return (
    <div className="app">
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
            {nav.map((n) => (
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
            {user && (
              <div className="tb-user" title={`Signed in as ${user.userid}`}>
                <span className="tb-avatar">{user.userid.slice(0, 2)}</span>
                <span className="tb-user-meta">
                  <b>{user.name || user.userid}</b>
                  <span className={`tag role-${user.role}`}>{user.role}</span>
                </span>
                <button type="button" className="btn sm ghost no-print" onClick={logout} title="Sign out">
                  <Icon name="logout" />
                  Sign out
                </button>
              </div>
            )}
            <button
              type="button"
              className="theme-toggle no-print"
              onClick={toggleTheme}
              title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
              aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
            >
              <Icon name={theme === "light" ? "moon" : "sun"} />
              {theme === "light" ? "Dark" : "Light"}
            </button>
          </header>
          <main className="content">{children}</main>
        </div>
      </div>
    </div>
  );
}
