import lancedb
import pyarrow as pa
from ..utils.config import settings
from ..utils.logging import get_logger

logger = get_logger(__name__)

TILE_SCHEMA = pa.schema([
    pa.field("tile_id", pa.string()),
    pa.field("semantic", pa.list_(pa.float32(), settings.semantic_dim)),
    pa.field("visual", pa.list_(pa.float32(), settings.visual_dim)),
    pa.field("bbox", pa.string()),
    pa.field("acquisition_date", pa.string()),
    pa.field("sensor", pa.string()),
    pa.field("cloud_cover", pa.float32()),
])

CHANGE_SCHEMA = pa.schema([
    pa.field("change_pair_id", pa.string()),
    pa.field("change_score", pa.float32()),
    pa.field("change_embedding", pa.list_(pa.float32(), settings.change_dim)),
    pa.field("bbox", pa.string()),
    pa.field("acquisition_date", pa.string()),
])

_db = None

def get_db():
    global _db
    if _db is None:
        _db = lancedb.connect(settings.lancedb_path)
    return _db

def init_lancedb():
    db = get_db()
    if "tiles" not in db.table_names():
        db.create_table("tiles", schema=TILE_SCHEMA)
    if "change_pairs" not in db.table_names():
        db.create_table("change_pairs", schema=CHANGE_SCHEMA)

def upsert_tile(record: dict):
    db = get_db()
    table = db.open_table("tiles")
    table.delete(f"tile_id = '{record['tile_id']}'")
    table.add([record])

def upsert_change_pair(record: dict):
    db = get_db()
    table = db.open_table("change_pairs")
    table.delete(f"change_pair_id = '{record['change_pair_id']}'")
    table.add([record])

def search_tiles(vector, where: str = None, limit: int = 20):
    db = get_db()
    table = db.open_table("tiles")
    q = table.search(vector).limit(limit)
    if where:
        q = q.where(where)
    return q.to_list()

def search_change_pairs(vector, where: str = None, limit: int = 20):
    db = get_db()
    table = db.open_table("change_pairs")
    q = table.search(vector).limit(limit)
    if where:
        q = q.where(where)
    return q.to_list()

def get_tile_vector(tile_id: str, field: str = "visual"):
    db = get_db()
    table = db.open_table("tiles")
    rows = table.search().where(f"tile_id = '{tile_id}'").limit(1).to_list()
    return rows[0][field] if rows else None

def get_change_vector(change_pair_id: str):
    db = get_db()
    table = db.open_table("change_pairs")
    rows = table.search().where(f"change_pair_id = '{change_pair_id}'").limit(1).to_list()
    return rows[0]["change_embedding"] if rows else None

def all_tile_vectors(field: str = "visual"):
    db = get_db()
    table = db.open_table("tiles")
    rows = table.to_pandas()
    return list(zip(rows["tile_id"], rows[field]))

def all_change_vectors():
    db = get_db()
    table = db.open_table("change_pairs")
    rows = table.to_pandas()
    return list(zip(rows["change_pair_id"], rows["change_embedding"]))
