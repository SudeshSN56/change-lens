import os
import hashlib
from datetime import datetime
import rasterio
from rasterio.warp import transform_bounds
from ..utils.logging import get_logger

logger = get_logger(__name__)

def checksum(file_path: str) -> str:
    h = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()

def read_cog_metadata(file_path: str) -> dict:
    """Open a COG with rasterio and extract metadata + WGS84 bounds."""
    with rasterio.open(file_path) as src:
        tags = src.tags()
        acquisition_date = (
            tags.get("TIFFTAG_DATETIME")
            or tags.get("acquisition_date")
            or datetime.fromtimestamp(os.path.getmtime(file_path)).isoformat()
        )
        sensor = tags.get("sensor") or _sensor_from_filename(file_path)

        bounds_wgs84 = transform_bounds(src.crs, "EPSG:4326", *src.bounds)

        return {
            "file_path": file_path,
            "crs": src.crs.to_string() if src.crs else None,
            "bounds": src.bounds,               # native CRS
            "bounds_wgs84": bounds_wgs84,        # (minx, miny, maxx, maxy)
            "width": src.width,
            "height": src.height,
            "count": src.count,
            "transform": src.transform,
            "acquisition_date": acquisition_date,
            "sensor": sensor,
            "checksum": checksum(file_path),
        }

def _sensor_from_filename(file_path: str) -> str:
    name = os.path.basename(file_path).lower()
    for token in ("sentinel-2", "sentinel2", "landsat", "planet", "worldview"):
        if token in name:
            return token
    return "unknown"

def validate_integrity(file_path: str) -> bool:
    try:
        with rasterio.open(file_path) as src:
            _ = src.read(1, window=((0, 1), (0, 1)))
        return True
    except Exception as e:
        logger.error(f"Corrupted COG {file_path}: {e}")
        return False
