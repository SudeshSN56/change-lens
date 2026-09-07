import json
import uuid
import numpy as np
import rasterio
from rasterio.windows import Window
from rasterio.warp import transform_bounds
from ..utils.config import settings
from ..utils.logging import get_logger
from ..db.sqlite import get_conn, log_provenance

logger = get_logger(__name__)

def _cloud_fraction(quality_band: np.ndarray, cloud_value_threshold: float = 0.6) -> float:
    """Assumes quality_band normalized 0-1, higher = more cloud-like brightness."""
    if quality_band.size == 0:
        return 0.0
    return float(np.mean(quality_band > cloud_value_threshold))

def _water_fraction(green: np.ndarray, nir: np.ndarray) -> float:
    """NDWI = (green - nir) / (green + nir); water where NDWI > 0."""
    denom = (green.astype(float) + nir.astype(float))
    denom[denom == 0] = 1e-6
    ndwi = (green.astype(float) - nir.astype(float)) / denom
    return float(np.mean(ndwi > 0))

def extract_tiles(scene_id: str, file_path: str, meta: dict) -> list:
    """Divide the scene into non-overlapping tile_size x tile_size patches.
    Skips tiles that are too cloudy or too much water. Returns created tile ids."""
    tile_size = settings.tile_size
    created_ids = []

    with rasterio.open(file_path) as src:
        band_count = src.count
        has_quality_band = band_count >= 4  # convention: band 4 = quality/QA if present
        has_green_nir = band_count >= 4     # convention: band 2=green, band 4=nir (adjust to your sensor)

        for y in range(0, src.height, tile_size):
            for x in range(0, src.width, tile_size):
                w = min(tile_size, src.width - x)
                h = min(tile_size, src.height - y)
                window = Window(x, y, w, h)

                if has_quality_band:
                    quality = src.read(band_count, window=window).astype(float)
                    quality = quality / (quality.max() + 1e-6)
                    cloud_frac = _cloud_fraction(quality)
                else:
                    cloud_frac = 0.0

                if cloud_frac > settings.cloud_cover_skip_threshold:
                    continue

                if has_green_nir and band_count >= 4:
                    green = src.read(2, window=window)
                    nir = src.read(4, window=window)
                    water_frac = _water_fraction(green, nir)
                else:
                    water_frac = 0.0

                if water_frac > settings.water_skip_threshold:
                    continue

                tile_transform = src.window_transform(window)
                minx, miny = tile_transform * (0, h)
                maxx, maxy = tile_transform * (w, 0)
                bounds_wgs84 = transform_bounds(src.crs, "EPSG:4326", minx, miny, maxx, maxy)
                bbox_geojson = {
                    "type": "Polygon",
                    "coordinates": [[
                        [bounds_wgs84[0], bounds_wgs84[1]],
                        [bounds_wgs84[0], bounds_wgs84[3]],
                        [bounds_wgs84[2], bounds_wgs84[3]],
                        [bounds_wgs84[2], bounds_wgs84[1]],
                        [bounds_wgs84[0], bounds_wgs84[1]],
                    ]],
                }

                tile_id = str(uuid.uuid4())
                with get_conn() as conn:
                    conn.execute(
                        """INSERT INTO tiles (id, scene_id, tile_x, tile_y, bbox_json)
                           VALUES (?,?,?,?,?)""",
                        (tile_id, scene_id, x // tile_size, y // tile_size, json.dumps(bbox_geojson)),
                    )
                    log_provenance(conn, tile_id, "tile", "extracted",
                                    {"cloud_frac": cloud_frac, "water_frac": water_frac})
                created_ids.append(tile_id)

    logger.info(f"Scene {scene_id}: extracted {len(created_ids)} tiles")
    return created_ids
