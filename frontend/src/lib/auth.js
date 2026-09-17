// Session state for the JWT issued by /api/auth/login. The token lives in sessionStorage,
// so it is scoped to this one tab and gone when the tab closes; it is sent as a Bearer header
// on every fetch, and the API also sets it as a cookie so plain <img src="/media/..."> loads.
// Leaving the tab (visibilitychange -> hidden) ends the session too, so coming back to the
// console always means signing in again. Any change fires "cl-auth" so App re-renders.
import { useEffect, useState } from "react";
import { API } from "./constants";

const TOKEN_KEY = "cl-token";
const USER_KEY = "cl-user";
const ROLE_RANK = { viewer: 0, analyst: 1, admin: 2 };

const read = (k) => {
  try {
    return sessionStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k, v) => {
  try {
    if (v === null) sessionStorage.removeItem(k);
    else sessionStorage.setItem(k, v);
  } catch {
    /* storage blocked: session lasts for this page only */
  }
};

let token = read(TOKEN_KEY);
let user = (() => {
  try {
    return JSON.parse(read(USER_KEY));
  } catch {
    return null;
  }
})();
let lastReason = null;

const emit = () => window.dispatchEvent(new Event("cl-auth"));

export const getUser = () => user;
export const authHeaders = () => (token ? { Authorization: `Bearer ${token}` } : {});
export const hasRole = (required, u = user) => Boolean(u) && (ROLE_RANK[u.role] ?? -1) >= ROLE_RANK[required];

export function signIn(res) {
  token = res.token;
  user = res.user;
  lastReason = null;
  write(TOKEN_KEY, token);
  write(USER_KEY, JSON.stringify(user));
  emit();
}

export function signOut({ reason = null, server = true } = {}) {
  if (!token && !user) return;
  token = null;
  user = null;
  lastReason = reason;
  write(TOKEN_KEY, null);
  write(USER_KEY, null);
  // Drop the media cookie too. keepalive lets the request finish even while the tab is hidden.
  if (server) fetch(API + "/api/auth/logout", { method: "POST", credentials: "include", keepalive: true }).catch(() => {});
  emit();
}

/** Current signed-in user (or null) plus the reason the last session ended, if any. */
export function useAuth() {
  const [state, setState] = useState({ user, reason: lastReason });
  useEffect(() => {
    const on = () => setState({ user, reason: lastReason });
    const onVisibility = () => {
      if (document.visibilityState === "hidden") signOut({ reason: "You left the console tab" });
    };
    window.addEventListener("cl-auth", on);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("cl-auth", on);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  return state;
}
