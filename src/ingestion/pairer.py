import json
import uuid
from shapely.geometry import shape
from ..utils.config import settings
from ..utils.logging import get_logger
from ..db.sqlite import get_conn, log_provenance

logger = get_logger(__name__)

def _centroid(bbox_json: str):
    return shape(json.loads(bbox_json)).centroid

def pair_scenes(before_scene_id: str, after_scene_id: str) -> list:
    """Pair tiles between a before/after scene, first by matching tile grid
    coordinates, then falling back to nearest-centroid spatial match within
    the configured tolerance."""
    created_pairs = []

    with get_conn() as conn:
        before_tiles = conn.execute(
            "SELECT * FROM tiles WHERE scene_id=?", (before_scene_id,)
        ).fetchall()
        after_tiles = conn.execute(
            "SELECT * FROM tiles WHERE scene_id=?", (after_scene_id,)
        ).fetchall()

        after_by_grid = {(t["tile_x"], t["tile_y"]): t for t in after_tiles}
        matched_after_ids = set()

        for bt in before_tiles:
            key = (bt["tile_x"], bt["tile_y"])
            at = after_by_grid.get(key)

            if at is None:
                # fallback: nearest centroid within tolerance
                bt_point = _centroid(bt["bbox_json"])
                best, best_dist = None, None
                for candidate in after_tiles:
                    if candidate["id"] in matched_after_ids:
                        continue
                    cand_point = _centroid(candidate["bbox_json"])
                    dist_deg = bt_point.distance(cand_point)
                    dist_m = dist_deg * 111_000  # rough deg->m at equator
                    if dist_m <= settings.pairing_spatial_tolerance_m and (
                        best_dist is None or dist_m < best_dist
                    ):
                        best, best_dist = candidate, dist_m
                at = best

            if at is None:
                continue

            matched_after_ids.add(at["id"])
            pair_id = str(uuid.uuid4())
            conn.execute(
                """INSERT INTO change_pairs (id, before_tile_id, after_tile_id)
                   VALUES (?,?,?)""",
                (pair_id, bt["id"], at["id"]),
            )
            log_provenance(conn, pair_id, "change_pair", "paired",
                            {"method": "grid" if key in after_by_grid else "spatial_fallback"})
            created_pairs.append(pair_id)

    logger.info(f"Created {len(created_pairs)} change pairs")
    return created_pairs
