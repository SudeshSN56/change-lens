import os
import time
import uuid
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
from ..utils.config import settings
from ..utils.logging import get_logger
from ..db.sqlite import get_conn, init_db, already_processed, mark_processed, log_provenance
from .cog_reader import read_cog_metadata, validate_integrity, checksum
from .tile_extractor import extract_tiles
from .pairer import pair_scenes
from ..inference.tasks import embed_change_pair

logger = get_logger(__name__)
SUPPORTED_EXT = {".tif", ".tiff"}


def _pair_key(file_path: str) -> str:
    return os.path.splitext(os.path.basename(file_path))[0]


def process_scene(file_path: str, role: str) -> str | None:
    if not validate_integrity(file_path):
        return None

    with get_conn() as conn:
        if already_processed(conn, file_path):
            return None

    meta = read_cog_metadata(file_path)
    pair_key = _pair_key(file_path)
    scene_id = str(uuid.uuid4())

    with get_conn() as conn:
        conn.execute(
            """INSERT INTO scenes
               (id, file_path, role, pair_key, acquisition_date, sensor, crs, processed)
               VALUES (?,?,?,?,?,?,?,1)""",
            (scene_id, file_path, role, pair_key, meta["acquisition_date"], meta["sensor"], meta["crs"]),
        )
        log_provenance(conn, scene_id, "scene", "ingested", {"role": role, "sensor": meta["sensor"]})
        mark_processed(conn, file_path, meta["checksum"])

    extract_tiles(scene_id, file_path, meta)
    _try_pair_and_embed(pair_key)
    return scene_id


def _try_pair_and_embed(pair_key: str):
    """Once both before and after scenes for pair_key exist, pair tiles and
    enqueue embedding tasks."""
    with get_conn() as conn:
        before = conn.execute(
            "SELECT * FROM scenes WHERE pair_key=? AND role='before'", (pair_key,)
        ).fetchone()
        after = conn.execute(
            "SELECT * FROM scenes WHERE pair_key=? AND role='after'", (pair_key,)
        ).fetchone()
        already_paired = conn.execute(
            """SELECT 1 FROM change_pairs cp
               JOIN tiles bt ON cp.before_tile_id = bt.id
               WHERE bt.scene_id = ?""",
            (before["id"] if before else "",),
        ).fetchone()

    if before and after and not already_paired:
        pair_ids = pair_scenes(before["id"], after["id"])
        for pid in pair_ids:
            embed_change_pair.delay(pid)


def scan_once():
    """One-shot scan of before/after directories (used by scripts/run_ingestion.py
    for local dev without a running watchdog daemon)."""
    for role, folder in (("before", settings.before_dir), ("after", settings.after_dir)):
        if not os.path.isdir(folder):
            continue
        for fname in os.listdir(folder):
            if os.path.splitext(fname)[1].lower() in SUPPORTED_EXT:
                process_scene(os.path.join(folder, fname), role)


class _Handler(FileSystemEventHandler):
    def __init__(self, role):
        self.role = role

    def on_created(self, event):
        if event.is_directory:
            return
        if os.path.splitext(event.src_path)[1].lower() in SUPPORTED_EXT:
            time.sleep(1)  # let the file finish writing
            process_scene(event.src_path, self.role)


def main():
    init_db()
    scan_once()  # catch anything already sitting in the folders

    observer = Observer()
    observer.schedule(_Handler("before"), settings.before_dir, recursive=False)
    observer.schedule(_Handler("after"), settings.after_dir, recursive=False)
    observer.start()
    logger.info(f"Watching {settings.before_dir} and {settings.after_dir}")

    try:
        while True:
            time.sleep(5)
    except KeyboardInterrupt:
        observer.stop()
    observer.join()


if __name__ == "__main__":
    main()
