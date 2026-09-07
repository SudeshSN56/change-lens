from pydantic import BaseModel
from typing import Optional, List, Dict, Any

class TextSearchRequest(BaseModel):
    query: str
    filters: Optional[Dict[str, Any]] = None
    limit: int = 50

class ImageSearchRequest(BaseModel):
    tile_id: str
    filters: Optional[Dict[str, Any]] = None
    limit: int = 50

class ChangeSearchRequest(BaseModel):
    change_pair_id: str
    filters: Optional[Dict[str, Any]] = None
    limit: int = 50

class ReviewDecisionRequest(BaseModel):
    change_pair_id: str
    decision: str
    analyst_id: Optional[str] = "analyst_1"
    notes: Optional[str] = None

class ExportRequest(BaseModel):
    change_pair_ids: List[str]
    format: str = "geojson"
