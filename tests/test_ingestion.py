import os
import numpy as np
import rasterio
from rasterio.transform import from_origin
from src.ingestion.cog_reader import read_cog_metadata, checksum

def _make_tif(path, width=1024, height=1024, bands=4):
    transform = from_origin(0, 0, 1, 1)
    data = np.random.randint(0, 255, (bands, height, width), dtype=np.uint8)
    with rasterio.open(
        path, "w", driver="GTiff", width=width, height=height, count=bands,
        dtype="uint8", crs="EPSG:4326", transform=transform,
    ) as dst:
        dst.write(data)

def test_read_cog_metadata(tmp_path):
    tif_path = str(tmp_path / "scene1.tif")
    _make_tif(tif_path)
    meta = read_cog_metadata(tif_path)
    assert meta["width"] == 1024
    assert meta["crs"] is not None
    assert meta["checksum"] == checksum(tif_path)

def test_tile_extraction_creates_grid(tmp_path, monkeypatch):
    from src.utils.config import settings
    settings.sqlite_path = str(tmp_path / "test.db")
    from src.db.sqlite import init_db
    init_db()

    tif_path = str(tmp_path / "scene1.tif")
    _make_tif(tif_path, width=1024, height=1024, bands=4)
    meta = read_cog_metadata(tif_path)

    from src.db.sqlite import get_conn
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO scenes (id, file_path, role, pair_key) VALUES (?,?,?,?)",
            ("scene1", tif_path, "before", "scene1"),
        )

    from src.ingestion.tile_extractor import extract_tiles
    tile_ids = extract_tiles("scene1", tif_path, meta)
    assert len(tile_ids) > 0  # 1024/512 = 2x2 grid, minus any skipped by mock cloud/water data
