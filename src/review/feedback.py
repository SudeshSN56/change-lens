import uuid
from ..db.sqlite import get_conn, log_provenance
from ..search.reranker import apply_feedback_rerank


def record_decision(change_pair_id: str, decision: str, analyst_id: str = None, notes: str = None):
    if decision not in ("confirmed", "rejected"):
        raise ValueError("decision must be 'confirmed' or 'rejected'")

    with get_conn() as conn:
        pair = conn.execute("SELECT * FROM change_pairs WHERE id=?", (change_pair_id,)).fetchone()
        if not pair:
            raise ValueError("change pair not found")

        conn.execute(
            "UPDATE change_pairs SET decision=?, analyst_id=? WHERE id=?",
            (decision, analyst_id, change_pair_id),
        )
        conn.execute(
            """INSERT INTO review_decisions (id, change_pair_id, analyst_id, decision, notes)
               VALUES (?,?,?,?,?)""",
            (str(uuid.uuid4()), change_pair_id, analyst_id, decision, notes),
        )
        log_provenance(conn, change_pair_id, "change_pair", "reviewed",
                        {"decision": decision, "analyst_id": analyst_id})

    apply_feedback_rerank(change_pair_id, decision)


def get_stats():
    with get_conn() as conn:
        total = conn.execute("SELECT COUNT(*) c FROM change_pairs").fetchone()["c"]
        confirmed = conn.execute("SELECT COUNT(*) c FROM change_pairs WHERE decision='confirmed'").fetchone()["c"]
        rejected = conn.execute("SELECT COUNT(*) c FROM change_pairs WHERE decision='rejected'").fetchone()["c"]
    return {"total": total, "confirmed": confirmed, "rejected": rejected, "pending": total - confirmed - rejected}
