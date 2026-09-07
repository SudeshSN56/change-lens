# Geospatial Semantic Indexer & Change Detection

Full implementation of plan.md's tech stack: FastAPI, LanceDB, Celery+Redis, SQLite,
rasterio/GDAL, RemoteCLIP + Prithvi-100M, React+Vite+Tailwind, Docker.

## Before you run it
- **GDAL** must be installed at the OS level for rasterio to work (see docs/deployment.md).
- **RemoteCLIP** and **Prithvi-100M** checkpoints are not bundled — run `scripts/download_models.sh`.
- **Adapter heads are untrained** until you run `scripts/train_adapters.py` on a LEVIR-CD-style dataset.
- Redis must be running (Docker Compose handles this; locally, `redis-server`).

## Quick start (Docker)
```bash
docker-compose -f docker/docker-compose.yml up --build
```
Then drop matching-filename `.tif`/`.tiff` pairs into `data/before/` and `data/after/` —
the poller service ingests them automatically.

## Quick start (local dev)
See `docs/deployment.md` for the full non-Docker setup (GDAL, venv, Redis, Celery worker,
poller, API, and the React UI).

## API surface
- `GET  /health`
- `POST /v1/search/text` — `{query, filters, limit}`
- `POST /v1/search/image` — `{tile_id, filters, limit}`
- `POST /v1/search/change` — `{change_pair_id, filters, limit}`
- `GET  /v1/review/queue?limit=&min_score=&sensor=`
- `POST /v1/review/decision` — `{change_pair_id, decision, analyst_id, notes}`
- `GET  /v1/review/stats`
- `POST /v1/export` — `{change_pair_ids, format}`

## Offline jobs
- `python scripts/run_clustering.py` — Phase 6 discovery clustering (run nightly/weekly per plan.md)
- `python scripts/train_adapters.py --dataset <path>` — train the change-detection adapter heads
