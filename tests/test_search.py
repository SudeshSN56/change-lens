from src.search.filters import build_where_clause

def test_build_where_clause_sensor():
    clause = build_where_clause({"sensor": "sentinel-2"})
    assert clause == "sensor = 'sentinel-2'"

def test_build_where_clause_combined():
    clause = build_where_clause({"sensor": "sentinel-2", "cloud_cover_max": 20})
    assert "sensor = 'sentinel-2'" in clause
    assert "cloud_cover < 20" in clause

def test_build_where_clause_empty():
    assert build_where_clause({}) is None
    assert build_where_clause(None) is None
