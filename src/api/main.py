from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from ..utils.config import settings
from ..db.sqlite import init_db
from ..db.lancedb import init_lancedb
from .routes import health, search, review, export

app = FastAPI(title="Geospatial Semantic Indexer & Change Detection", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup():
    init_db()
    init_lancedb()

app.mount("/files/before", StaticFiles(directory=settings.before_dir), name="before")
app.mount("/files/after", StaticFiles(directory=settings.after_dir), name="after")

app.include_router(health.router)
app.include_router(search.router)
app.include_router(review.router)
app.include_router(export.router)
