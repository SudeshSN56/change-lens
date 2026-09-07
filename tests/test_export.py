import json

def test_export_feature_structure(tmp_path):
    from src.utils.config import settings
    settings.sqlite_path = str(tmp_path / "test.db")
    from src.db.sqlite import init_db, get_conn
    init_db()

    with get_conn() as conn:
        conn.execute("INSERT INTO scenes (id, file_path, role, pair_key, sensor) VALUES (?,?,?,?,?)",
                     ("s1", "before.tif", "before", "p1", "sentinel-2"))
        conn.execute("INSERT INTO scenes (id, file_path, role, pair_key, sensor) VALUES (?,?,?,?,?)",
                     ("s2", "after.tif", "after", "p1", "sentinel-2"))
        conn.execute("INSERT INTO tiles (id, scene_id, bbox_json) VALUES (?,?,?)",
                     ("t1", "s1", json.dumps({"type": "Polygon", "coordinates": [[[0,0],[0,1],[1,1],[1,0],[0,0]]]})))
        conn.execute("INSERT INTO tiles (id, scene_id, bbox_json) VALUES (?,?,?)",
                     ("t2", "s2", json.dumps({"type": "Polygon", "coordinates": [[[0,0],[0,1],[1,1],[1,0],[0,0]]]})))
        conn.execute("INSERT INTO change_pairs (id, before_tile_id, after_tile_id, change_score) VALUES (?,?,?,?)",
                     ("cp1", "t1", "t2", 0.8))

    from src.export.geojson import export_geojson
    result = export_geojson(["cp1"])
    assert result["type"] == "FeatureCollection"
    assert len(result["features"]) == 1
    assert result["features"][0]["properties"]["change_score"] == 0.8
