const API_BASE = "http://localhost:8080";

async function post(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function get(path) {
  const res = await fetch(`${API_BASE}${path}`);
  return res.json();
}

export const api = {
  base: API_BASE,
  health: () => get("/health"),
  searchText: (query, limit = 20) => post("/v1/search/text", { query, limit }),
  searchImage: (tile_id, limit = 12) => post("/v1/search/image", { tile_id, limit }),
  searchChange: (change_pair_id, limit = 12) => post("/v1/search/change", { change_pair_id, limit }),
  reviewQueue: (limit = 50, min_score = 0) => get(`/v1/review/queue?limit=${limit}&min_score=${min_score}`),
  reviewDecision: (change_pair_id, decision) => post("/v1/review/decision", { change_pair_id, decision }),
  reviewStats: () => get("/v1/review/stats"),
  export: (change_pair_ids) => post("/v1/export", { change_pair_ids }),
};
