from ..db.sqlite import get_conn


def get_queue(min_score: float = 0.0, limit: int = 50, sensor: str = None):
    query = """
        SELECT cp.*, bt.bbox_json AS before_bbox, at.bbox_json AS after_bbox,
               COALESCE(rw.weight, 1.0) AS rerank_weight
        FROM change_pairs cp
        JOIN tiles bt ON cp.before_tile_id = bt.id
        JOIN tiles at ON cp.after_tile_id = at.id
        LEFT JOIN rerank_weights rw ON rw.change_pair_id = cp.id
        WHERE cp.decision = 'pending' AND cp.change_score >= ?
    """
    params = [min_score]
    if sensor:
        query += """ AND bt.scene_id IN (SELECT id FROM scenes WHERE sensor = ?)"""
        params.append(sensor)

    query += " ORDER BY (cp.change_score * COALESCE(rw.weight, 1.0)) DESC LIMIT ?"
    params.append(limit)

    with get_conn() as conn:
        rows = conn.execute(query, params).fetchall()
    return [dict(r) for r in rows]
