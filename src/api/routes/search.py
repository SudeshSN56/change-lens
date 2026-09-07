from fastapi import APIRouter
from ..models.schemas import TextSearchRequest, ImageSearchRequest, ChangeSearchRequest
from ...search.vector_search import text_search, image_search, change_search

router = APIRouter(prefix="/v1/search")

@router.post("/text")
def search_text(req: TextSearchRequest):
    return text_search(req.query, filters=req.filters, limit=req.limit)

@router.post("/image")
def search_image(req: ImageSearchRequest):
    return image_search(req.tile_id, filters=req.filters, limit=req.limit)

@router.post("/change")
def search_change(req: ChangeSearchRequest):
    return change_search(req.change_pair_id, filters=req.filters, limit=req.limit)
