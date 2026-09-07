from fastapi import APIRouter, HTTPException
from ..models.schemas import ReviewDecisionRequest
from ...review.queue import get_queue
from ...review.feedback import record_decision, get_stats

router = APIRouter(prefix="/v1/review")

@router.get("/queue")
def review_queue(limit: int = 50, min_score: float = 0.0, sensor: str = None):
    return get_queue(min_score=min_score, limit=limit, sensor=sensor)

@router.post("/decision")
def review_decision(req: ReviewDecisionRequest):
    try:
        record_decision(req.change_pair_id, req.decision, req.analyst_id, req.notes)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"status": "ok"}

@router.get("/stats")
def review_stats():
    return get_stats()
