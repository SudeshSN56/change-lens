from fastapi import APIRouter
from ..models.schemas import ExportRequest
from ...export.geojson import export_geojson

router = APIRouter(prefix="/v1/export")

@router.post("")
def export(req: ExportRequest):
    return export_geojson(req.change_pair_ids)
