import { useEffect, useState } from "react";
import { ErrorBox, Loading, Notice, PageHead, Panel } from "../components/ui";
import { getUser } from "../lib/auth";
import { deleteJSON, getJSON, postJSON } from "../lib/hooks";

const ROLE_HELP = {
  viewer: "Overview, query, explorer and tile assessments. Read-only.",
  analyst: "Viewer access plus uploading imagery for analysis.",
  admin: "Analyst access plus managing accounts on this page.",
};

const blank = { userid: "", name: "", role: "viewer", password: "" };

export default function Users() {
  const me = getUser();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [form, setForm] = useState(blank);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirmId, setConfirmId] = useState(null);

  const load = () =>
    getJSON("/api/auth/users")
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  const editing = data?.users.some((u) => u.userid === form.userid.trim().toUpperCase());

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const body = { ...form, userid: form.userid.trim(), password: form.password || null };
      const r = await postJSON("/api/auth/users", body);
      setMsg({ kind: "info", text: `${editing ? "Updated" : "Created"} ${r.user.userid} (${r.user.role}).` });
      setForm(blank);
      load();
    } catch (err) {
      setMsg({ kind: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (userid) => {
    setBusy(true);
    setMsg(null);
    try {
      await deleteJSON(`/api/auth/users/${encodeURIComponent(userid)}`);
      setMsg({ kind: "info", text: `Deleted ${userid}.` });
      setConfirmId(null);
      load();
    } catch (err) {
      setMsg({ kind: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead eyebrow="Administration" title="User accounts" sub="Who can sign in to this console and what each account is allowed to do." />
      {error && <ErrorBox title="Could not load accounts" detail={error} hint="Only admin accounts can manage users." />}
      {!data && !error && <Loading label="Loading accounts" />}
      {data && (
        <div className="users-grid">
          <Panel title="Accounts" sub={`${data.users.length} account${data.users.length === 1 ? "" : "s"}`} flush>
            <table className="dtable">
              <thead>
                <tr>
                  <th>User id</th>
                  <th>Name</th>
                  <th>Role</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.users.map((u) => (
                  <tr key={u.userid}>
                    <td className="mono">
                      {u.userid}
                      {u.userid === me?.userid && <span className="muted small"> (you)</span>}
                    </td>
                    <td>{u.name}</td>
                    <td>
                      <span className={`tag role-${u.role}`}>{u.role}</span>
                    </td>
                    <td className="users-actions">
                      <button type="button" className="btn sm ghost" onClick={() => setForm({ userid: u.userid, name: u.name, role: u.role, password: "" })}>
                        Edit
                      </button>
                      {u.userid !== me?.userid &&
                        (confirmId === u.userid ? (
                          <>
                            <button type="button" className="btn sm" disabled={busy} onClick={() => remove(u.userid)}>
                              Confirm delete
                            </button>
                            <button type="button" className="btn sm ghost" onClick={() => setConfirmId(null)}>
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button type="button" className="btn sm ghost" onClick={() => setConfirmId(u.userid)}>
                            Delete
                          </button>
                        ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>

          <Panel title={editing ? "Edit account" : "New account"} sub={editing ? "Leave the password blank to keep the current one." : "The user id is stored in upper case."}>
            <form className="users-form" onSubmit={save}>
              {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
              <label className="field">
                <span>User id</span>
                <input type="text" value={form.userid} onChange={(e) => setForm({ ...form, userid: e.target.value.toUpperCase() })} spellCheck={false} required />
              </label>
              <label className="field">
                <span>Display name</span>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </label>
              <label className="field">
                <span>Role</span>
                <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  {data.roles.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <small className="muted">{ROLE_HELP[form.role]}</small>
              </label>
              <label className="field">
                <span>{editing ? "New password" : "Password"}</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder={editing ? "unchanged" : "min. 6 characters"}
                />
              </label>
              <div className="users-form-actions">
                <button type="submit" className="btn primary" disabled={busy}>
                  {editing ? "Save changes" : "Create account"}
                </button>
                {editing && (
                  <button type="button" className="btn ghost" onClick={() => setForm(blank)}>
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </Panel>
        </div>
      )}
    </>
  );
}
