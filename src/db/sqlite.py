import sqlite3
import json
import uuid
from contextlib import contextmanager
from ..utils.config import settings

SCHEMA = """
CREATE TABLE IF NOT EXISTS processed_files (
    file_path TEXT PRIMARY KEY,
    checksum TEXT,
    processed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS scenes (
    id TEXT PRIMARY KEY,
    file_path TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('before','after')),
    pair_key TEXT NOT NULL,
    acquisition_date DATETIME,
    sensor TEXT,
    cloud_cover REAL,
    crs TEXT,
    processed BOOLEAN DEFAULT 0,
    ingested_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tiles (
    id TEXT PRIMARY KEY,
    scene_id TEXT NOT NULL,
    tile_x INTEGER,
    tile_y INTEGER,
    bbox_json TEXT,
    cloud_mask_path TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (scene_id) REFERENCES scenes(id)
);

CREATE TABLE IF NOT EXISTS change_pairs (
    id TEXT PRIMARY KEY,
    before_tile_id TEXT NOT NULL,
    after_tile_id TEXT NOT NULL,
    change_score REAL,
    cluster_visual INTEGER,
    cluster_change INTEGER,
    decision TEXT DEFAULT 'pending' CHECK(decision IN ('pending','confirmed','rejected')),
    analyst_id TEXT,
    earliest_available_date DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (before_tile_id) REFERENCES tiles(id),
    FOREIGN KEY (after_tile_id) REFERENCES tiles(id)
);

CREATE TABLE IF NOT EXISTS review_decisions (
    id TEXT PRIMARY KEY,
    change_pair_id TEXT NOT NULL,
    analyst_id TEXT,
    decision TEXT CHECK(decision IN ('confirmed','rejected','pending')),
    feedback_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    FOREIGN KEY (change_pair_id) REFERENCES change_pairs(id)
);

CREATE TABLE IF NOT EXISTS provenance (
    id TEXT PRIMARY KEY,
    entity_id TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    action TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    metadata_json TEXT
);

CREATE TABLE IF NOT EXISTS rerank_weights (
    change_pair_id TEXT PRIMARY KEY,
    weight REAL DEFAULT 1.0
);
"""

@contextmanager
def get_conn():
    conn = sqlite3.connect(settings.sqlite_path)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()

def init_db():
    with get_conn() as conn:
        conn.executescript(SCHEMA)

def log_provenance(conn, entity_id: str, entity_type: str, action: str, metadata: dict = None):
    conn.execute(
        "INSERT INTO provenance (id, entity_id, entity_type, action, metadata_json) VALUES (?,?,?,?,?)",
        (str(uuid.uuid4()), entity_id, entity_type, action, json.dumps(metadata or {})),
    )

def already_processed(conn, file_path: str) -> bool:
    row = conn.execute("SELECT 1 FROM processed_files WHERE file_path=?", (file_path,)).fetchone()
    return row is not None

def mark_processed(conn, file_path: str, checksum: str):
    conn.execute(
        "INSERT OR REPLACE INTO processed_files (file_path, checksum) VALUES (?,?)",
        (file_path, checksum),
    )
