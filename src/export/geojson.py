import json
from ..db.sqlite import get_conn, log_provenance


def export_geojson(change_pair_ids: list) -> dict:
    features = []

    with get_conn() as conn:
        for pid in change_pair_ids:
            pair = conn.execute("SELECT * FROM change_pairs WHERE id=?", (pid,)).fetchone()
            if not pair:
                continue
            before_tile = conn.execute("SELECT * FROM tiles WHERE id=?", (pair["before_tile_id"],)).fetchone()
            after_tile = conn.execute("SELECT * FROM tiles WHERE id=?", (pair["after_tile_id"],)).fetchone()
            before_scene = conn.execute("SELECT * FROM scenes WHERE id=?", (before_tile["scene_id"],)).fetchone()
            after_scene = conn.execute("SELECT * FROM scenes WHERE id=?", (after_tile["scene_id"],)).fetchone()
            decisions = conn.execute(
                "SELECT * FROM review_decisions WHERE change_pair_id=? ORDER BY feedback_timestamp", (pid,)
            ).fetchall()
            provenance = conn.execute(
                """SELECT * FROM provenance WHERE entity_id IN (?,?,?,?) ORDER BY timestamp""",
                (pid, before_tile["id"], after_tile["id"], before_scene["id"]),
            ).fetchall()

            geometry = json.loads(after_tile["bbox_json"])

            features.append({
                "type": "Feature",
                "geometry": geometry,
                "properties": {
                    "change_pair_id": pair["id"],
                    "change_score": pair["change_score"],
                    "decision": pair["decision"],
                    "analyst_id": pair["analyst_id"],
                    "before_scene_path": before_scene["file_path"],
                    "after_scene_path": after_scene["file_path"],
                    "before_acquisition_date": before_scene["acquisition_date"],
                    "after_acquisition_date": after_scene["acquisition_date"],
                    "sensor": after_scene["sensor"],
                    "review_history": [dict(d) for d in decisions],
                    "provenance": [dict(p) for p in provenance],
                },
            })
            log_provenance(conn, pid, "change_pair", "exported", {})

    return {"type": "FeatureCollection", "features": features}
