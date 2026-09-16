import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { API } from "./constants";

async function readJSON(r) {
  if (r.ok) return r.json();
  const body = await r.json().catch(() => ({}));
  throw new Error(body.detail || `HTTP ${r.status}`);
}

export const getJSON = (path) => fetch(API + path).then(readJSON);
export const postJSON = (path, body) =>
  fetch(API + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(readJSON);
export const postForm = (path, form) => fetch(API + path, { method: "POST", body: form }).then(readJSON);

/** Colour theme, persisted per browser. Dark is the default look. */
export function useTheme() {
  const [theme, setTheme] = useState(() => {
    try {
      if (localStorage.getItem("cl-theme") === "light") return "light";
    } catch {
      /* storage blocked */
    }
    return "dark";
  });
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("cl-theme", theme);
    } catch {
      /* storage blocked */
    }
  }, [theme]);
  return [theme, () => setTheme((t) => (t === "light" ? "dark" : "light"))];
}

/** Holds the previous data while a new path loads, so views dim instead of flashing. */
export function useJSON(path) {
  const [state, setState] = useState({ data: null, error: null, loading: Boolean(path) });
  useEffect(() => {
    if (!path) return undefined;
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    getJSON(path)
      .then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((e) => alive && setState({ data: null, error: e.message, loading: false }));
    return () => {
      alive = false;
    };
  }, [path]);
  return state;
}

export function useStoredState(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const s = localStorage.getItem(key);
      return s === null ? initial : JSON.parse(s);
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (next) =>
      setValue((prev) => {
        const v = typeof next === "function" ? next(prev) : next;
        try {
          localStorage.setItem(key, JSON.stringify(v));
        } catch {
          /* storage unavailable: keep in memory only */
        }
        return v;
      }),
    [key],
  );
  return [value, set];
}

export function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    // Measure synchronously so the first paint has a size; the observer handles resizes.
    setWidth(Math.floor(el.getBoundingClientRect().width));
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/* ------------------------------------------------------------------ routing */
function parseHash() {
  const h = window.location.hash.replace(/^#\/?/, "");
  const [path, qs = ""] = h.split("?");
  return {
    parts: path.split("/").filter(Boolean).map(decodeURIComponent),
    params: new URLSearchParams(qs),
  };
}

export function useRoute() {
  const [route, setRoute] = useState(parseHash);
  useEffect(() => {
    const on = () => setRoute(parseHash());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}

export const go = (to) => {
  window.location.hash = to.replace(/^#/, "");
};

/* The list the operator last came from, so a tile assessment can step prev / next. */
const NAV_KEY = "cl.navlist";
export function setNavList(ids, label) {
  try {
    sessionStorage.setItem(NAV_KEY, JSON.stringify({ ids, label }));
  } catch {
    /* storage unavailable */
  }
}
export function getNavList() {
  try {
    return JSON.parse(sessionStorage.getItem(NAV_KEY)) ?? { ids: [], label: "" };
  } catch {
    return { ids: [], label: "" };
  }
}

export const isTyping = (el) => Boolean(el?.closest?.("input, textarea, select, [contenteditable=true]"));
