#!/bin/bash
set -e

ROLE=${1:-api}

python3 -c "from src.db.sqlite import init_db; init_db()"
python3 -c "from src.db.lancedb import init_lancedb; init_lancedb()"

case "$ROLE" in
  api)
    exec uvicorn src.api.main:app --host 0.0.0.0 --port 8080
    ;;
  worker)
    exec celery -A src.inference.tasks.celery_app worker --loglevel=info --concurrency=2
    ;;
  poller)
    exec python3 -m src.ingestion.poller
    ;;
  *)
    echo "Unknown role: $ROLE (expected api|worker|poller)"
    exit 1
    ;;
esac
