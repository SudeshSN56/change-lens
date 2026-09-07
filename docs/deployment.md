# Deployment

## Docker (recommended)
```bash
docker build -t geo-indexer:v1.0.0 -f docker/Dockerfile .
docker-compose -f docker/docker-compose.yml up
```

## Local dev (no Docker)
Requires system GDAL first:
```bash
# Ubuntu/Debian
sudo apt-get install gdal-bin libgdal-dev
# macOS
brew install gdal
```

Then:
```bash
python3.10 -m venv venv && source venv/bin/activate
pip install -r requirements.txt -r requirements-gpu.txt

redis-server &                                  # broker
python scripts/run_ingestion.py                 # one-shot scan, or:
python -m src.ingestion.poller &                # continuous watcher
celery -A src.inference.tasks.celery_app worker --loglevel=info &
uvicorn src.api.main:app --reload --port 8080

cd ui && npm install && npm run dev
```
