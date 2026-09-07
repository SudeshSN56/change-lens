from ..db import lancedb as lancedb_wrapper
from .filters import build_where_clause


def text_search(query: str, filters: dict = None, limit: int = 50):
    from ..inference.encoder import embed_text

    vector = embed_text(query)
    where = build_where_clause(filters)
    return lancedb_wrapper.search_tiles(vector, where=where, limit=limit)


def image_search(tile_id: str, filters: dict = None, limit: int = 50):
    vector = lancedb_wrapper.get_tile_vector(tile_id, field="visual")
    if vector is None:
        return []
    where = build_where_clause(filters)
    results = lancedb_wrapper.search_tiles(vector, where=where, limit=limit + 1)
    return [r for r in results if r["tile_id"] != tile_id][:limit]


def change_search(change_pair_id: str, filters: dict = None, limit: int = 50):
    vector = lancedb_wrapper.get_change_vector(change_pair_id)
    if vector is None:
        return []
    where = build_where_clause(filters)
    results = lancedb_wrapper.search_change_pairs(vector, where=where, limit=limit + 1)
    return [r for r in results if r["change_pair_id"] != change_pair_id][:limit]
