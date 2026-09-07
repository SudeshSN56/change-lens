"""Manual one-shot ingestion — useful for local dev without the poller daemon."""
import os
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))
os.chdir(PROJECT_ROOT)

from src.db.sqlite import init_db
from src.db.lancedb import init_lancedb
from src.ingestion.poller import scan_once

if __name__ == "__main__":
    init_db()
    init_lancedb()
    scan_once()
    print("Ingestion scan complete.")
