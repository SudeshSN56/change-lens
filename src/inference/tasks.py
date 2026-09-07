from celery import Celery
from ..utils.config import settings
from ..utils.logging import get_logger
from ..db.sqlite import get_conn, log_provenance
from ..db.lancedb import upsert_tile, upsert_change_pair
from .encoder import embed_semantic_visual, compute_change_score_and_embedding

logger = get_logger(__name__)

celery_app = Celery("geo_indexer", broker=settings.redis_url, backend=settings.redis_url)
celery_app.conf.task_serializer = "json"
celery_app.conf.accept_content = ["json"]


@celery_app.task(name="embed_change_pair")
def embed_change_pair(change_pair_id: str):
    with get_conn() as conn:
        pair = conn.execute("SELECT * FROM change_pairs WHERE id=?", (change_pair_id,)).fetchone()
        before_tile = conn.execute("SELECT * FROM tiles WHERE id=?", (pair["before_tile_id"],)).fetchone()
        after_tile = conn.execute("SELECT * FROM tiles WHERE id=?", (pair["after_tile_id"],)).fetchone()
        before_scene = conn.execute("SELECT * FROM scenes WHERE id=?", (before_tile["scene_id"],)).fetchone()
        after_scene = conn.execute("SELECT * FROM scenes WHERE id=?", (after_tile["scene_id"],)).fetchone()

    # NOTE: this MVP embeds the whole source scene per tile bbox metadata only,
    # rather than physically cropping out each 512x512 tile raster to disk.
    # For production, crop + save each tile's pixels in tile_extractor.py and
    # point these embed calls at the cropped tile file instead of the scene.
    before_path = before_scene["file_path"]
    after_path = after_scene["file_path"]

    before_sem, before_vis = embed_semantic_visual(before_path)
    after_sem, after_vis = embed_semantic_visual(after_path)

    upsert_tile({
        "tile_id": before_tile["id"], "semantic": before_sem.tolist(), "visual": before_vis.tolist(),
        "bbox": before_tile["bbox_json"], "acquisition_date": str(before_scene["acquisition_date"]),
        "sensor": before_scene["sensor"] or "", "cloud_cover": before_scene["cloud_cover"] or 0.0,
    })
    upsert_tile({
        "tile_id": after_tile["id"], "semantic": after_sem.tolist(), "visual": after_vis.tolist(),
        "bbox": after_tile["bbox_json"], "acquisition_date": str(after_scene["acquisition_date"]),
        "sensor": after_scene["sensor"] or "", "cloud_cover": after_scene["cloud_cover"] or 0.0,
    })

    score, change_emb = compute_change_score_and_embedding(before_path, after_path)

    upsert_change_pair({
        "change_pair_id": change_pair_id, "change_score": score,
        "change_embedding": change_emb.tolist(), "bbox": after_tile["bbox_json"],
        "acquisition_date": str(after_scene["acquisition_date"]),
    })

    with get_conn() as conn:
        conn.execute("UPDATE change_pairs SET change_score=? WHERE id=?", (score, change_pair_id))
        log_provenance(conn, change_pair_id, "change_pair", "classified",
                        {"change_score": score, "model": "prithvi+adapters"})

    logger.info(f"Embedded change_pair {change_pair_id} (score={score:.3f})")
    return {"change_pair_id": change_pair_id, "change_score": score}
