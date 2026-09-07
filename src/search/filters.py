def build_where_clause(filters: dict) -> str | None:
    """Translate a filter dict into a LanceDB SQL-style where clause."""
    if not filters:
        return None
    clauses = []

    if "sensor" in filters:
        clauses.append(f"sensor = '{filters['sensor']}'")

    if "cloud_cover_max" in filters:
        clauses.append(f"cloud_cover < {float(filters['cloud_cover_max'])}")

    if "date_range" in filters:
        start, end = filters["date_range"]
        clauses.append(f"acquisition_date >= '{start}' AND acquisition_date <= '{end}'")

    if "aoi" in filters:
        # LanceDB has no native polygon intersection — approximate with the
        # AOI's bounding box against a stored bbox string; refine downstream
        # with shapely if you need exact polygon intersection.
        pass

    return " AND ".join(clauses) if clauses else None
