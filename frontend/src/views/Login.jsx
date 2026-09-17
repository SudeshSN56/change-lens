import { useEffect, useState } from "react";
import { Icon } from "../components/Icons";
import { signIn } from "../lib/auth";
import { postJSON } from "../lib/hooks";

export default function Login({ online, reason }) {
  const [userid, setUserid] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    document.getElementById("login-userid")?.focus();
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!userid.trim() || !password) {
      setError("Enter your user id and password.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await postJSON("/api/auth/login", { userid: userid.trim(), password });
      signIn(res);
    } catch (err) {
      setError(err.message);
      setPassword("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <form className="login-card panel" onSubmit={submit} noValidate>
        <div className="login-brand">
          <span className="brand-mark">
            <Icon name="radar" size={22} />
          </span>
          <div>
            <b>CHANGE LENS</b>
            <small>Change intelligence console</small>
          </div>
        </div>

        <div className="login-head">
          <div className="eyebrow">Restricted access</div>
          <h1>Analyst sign-in</h1>
          <p>Sign in with the user id and password issued to you. The session is tied to this tab and ends as soon as you leave it.</p>
        </div>

        {reason && !error && (
          <div className="notice warn" role="status">
            <Icon name="info" />
            <div>{reason}. Please sign in again.</div>
          </div>
        )}
        {error && (
          <div className="notice error" role="alert">
            <Icon name="alert" />
            <div>{error}</div>
          </div>
        )}

        <label className="field login-field">
          <span>User id</span>
          <input
            id="login-userid"
            type="text"
            autoComplete="username"
            autoCapitalize="characters"
            spellCheck={false}
            value={userid}
            onChange={(e) => setUserid(e.target.value.toUpperCase())}
            placeholder="e.g. JOHNDOE"
            disabled={busy}
          />
        </label>
        <label className="field login-field">
          <span>Password</span>
          <div className="login-pass">
            <input
              id="login-password"
              type={show ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="password"
              disabled={busy}
            />
            <button type="button" className="link-btn" onClick={() => setShow((s) => !s)} tabIndex={-1}>
              {show ? "Hide" : "Show"}
            </button>
          </div>
        </label>

        <button type="submit" className="btn primary login-submit" disabled={busy}>
          {busy ? "Signing in..." : "Sign in"}
        </button>

        <div className={`login-link ${online ? "up" : online === false ? "down" : ""}`}>
          <span className="link-dot" />
          {online ? "API link up" : online === false ? "API link down: the sign-in service is unreachable" : "Connecting"}
        </div>
      </form>
    </div>
  );
}
