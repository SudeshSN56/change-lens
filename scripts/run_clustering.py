"""Offline clustering job (Phase 6) — run manually, via cron, or nightly."""
import argparse
import numpy as np
from sklearn.cluster import KMeans
from src.db.sqlite import get_conn
from src.db.lancedb import all_tile_vectors, all_change_vectors


def run(k_visual: int = 100, k_change: int = 20):
    visual_items = all_tile_vectors()
    if len(visual_items) >= 2:
        ids, vecs = zip(*visual_items)
        k = min(k_visual, len(ids))
        labels = KMeans(n_clusters=k, n_init=10, random_state=42).fit_predict(np.array(vecs))
        with get_conn() as conn:
            for tid, label in zip(ids, labels):
                conn.execute("UPDATE tiles SET cluster_visual=? WHERE id=?", (int(label), tid))
        print(f"Clustered {len(ids)} tiles into {k} visual clusters")

    change_items = all_change_vectors()
    if len(change_items) >= 2:
        ids, vecs = zip(*change_items)
        k = min(k_change, len(ids))
        labels = KMeans(n_clusters=k, n_init=10, random_state=42).fit_predict(np.array(vecs))
        with get_conn() as conn:
            for pid, label in zip(ids, labels):
                conn.execute("UPDATE change_pairs SET cluster_change=? WHERE id=?", (int(label), pid))
        print(f"Clustered {len(ids)} change pairs into {k} change clusters")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--k-visual", type=int, default=100)
    parser.add_argument("--k-change", type=int, default=20)
    args = parser.parse_args()
    run(args.k_visual, args.k_change)
