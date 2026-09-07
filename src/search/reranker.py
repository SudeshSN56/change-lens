from ..db.sqlite import get_conn
from ..db.lancedb import get_change_vector, search_change_pairs

BOOST_FACTOR = 1.10
PENALTY_FACTOR = 0.90


def apply_feedback_rerank(change_pair_id: str, decision: str, neighbors: int = 10):
    """On confirm/reject, nudge the rerank weight of visually-similar change
    pairs so future queue ordering reflects analyst feedback."""
    vector = get_change_vector(change_pair_id)
    if vector is None:
        return

    factor = BOOST_FACTOR if decision == "confirmed" else PENALTY_FACTOR
    neighbors_result = search_change_pairs(vector, limit=neighbors + 1)

    with get_conn() as conn:
        for row in neighbors_result:
            pid = row["change_pair_id"]
            if pid == change_pair_id:
                continue
            existing = conn.execute(
                "SELECT weight FROM rerank_weights WHERE change_pair_id=?", (pid,)
            ).fetchone()
            current = existing["weight"] if existing else 1.0
            new_weight = max(0.1, min(3.0, current * factor))
            conn.execute(
                "INSERT OR REPLACE INTO rerank_weights (change_pair_id, weight) VALUES (?,?)",
                (pid, new_weight),
            )
