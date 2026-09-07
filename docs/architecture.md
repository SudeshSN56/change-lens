# Architecture Note

## Data flow
1. `src/ingestion/poller.py` watches `data/before/` and `data/after/` (watchdog).
2. On a new file, `cog_reader.py` reads GDAL/rasterio metadata + WGS84 bounds.
3. `tile_extractor.py` splits the scene into 512×512 tiles, skipping cloudy/water tiles,
   and writes tile bboxes to SQLite.
4. Once both sides of a pair_key exist, `pairer.py` matches tiles by grid position
   (fallback: nearest centroid within 100m) and creates `change_pairs` rows.
5. Each new pair is enqueued as a Celery task (`tasks.embed_change_pair`), which:
   - runs RemoteCLIP for semantic/visual embeddings (LanceDB `tiles` table)
   - runs Prithvi + adapter heads for change score + 64-dim change embedding (LanceDB `change_pairs` table)
6. FastAPI (`src/api`) serves search, review, export, and health endpoints.
7. The React UI (`ui/`) drives ingestion, search, review, and discovery.

## Storage
- SQLite: relational metadata (scenes, tiles, change_pairs, review_decisions, provenance).
- LanceDB: vector embeddings with metadata filtering.

## Known simplifications vs. a full production build
- Tiles are embedded from the full source scene rather than cropped per-tile rasters.
- Prithvi is loaded as a generic ViT-B/16 backbone; exact Prithvi checkpoint key
  mapping may need adjustment once you download real weights.
- Adapter heads ship untrained — run `scripts/train_adapters.py` against LEVIR-CD.
