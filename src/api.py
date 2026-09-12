"""FastAPI backend.

    uvicorn api:app --app-dir src --port 8000

The index is loaded into RAM at startup and every /api/query is a pass over it,
so search never touches the GPU. The model is loaded lazily on the first
/api/analyze call, which keeps startup instant and means the query and gallery
paths still work even if no checkpoint exists yet.
"""

import io
import json
import uuid
from pathlib import Path
from typing import Optional

import numpy as np
import torch
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from PIL import Image
from pydantic import BaseModel

import parser as qparser
from analyze import build_record
from overlay import save_overlay
from search import SimilarityIndex, run_query

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
ANALYZED = DATA / "analyzed"
UPLOADS = ROOT / "uploads"

app = FastAPI(title="ChangeLens API", version="1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173",
                   "http://localhost:4173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

STATE = {"records": [], "by_id": {}, "sim": None, "model": None,
         "device": "cuda" if torch.cuda.is_available() else "cpu",
         "source": "none"}


def load_index():
    """Prefer model predictions; fall back to the ground-truth index if the model
    index has not been built yet. The active source is reported by /api/health and
    stamped on every record, so the UI can always say which it is showing."""
    for name, src in (("index.json", "model"), ("index_gt.json", "ground_truth")):
        p = ANALYZED / name
        if p.exists():
            recs = json.loads(p.read_text())
            STATE["records"] = recs
            STATE["by_id"] = {r["pair_id"]: r for r in recs}
            STATE["sim"] = SimilarityIndex(recs) if recs else None
            STATE["source"] = src
            print(f"[api] loaded {len(recs)} records from {name} (source={src})")
            return
    print("[api] WARNING: no index found -- run src/analyze.py")


@app.on_event("startup")
def _startup():
    UPLOADS.mkdir(exist_ok=True)
    load_index()


def get_model():
    """Lazy singleton. Raises a clear 503 rather than a stack trace if untrained."""
    if STATE["model"] is None:
        from model import build_model
        ckpt_path = ROOT / "weights" / "best.pt"
        if not ckpt_path.exists():
            raise HTTPException(503, "No trained checkpoint at weights/best.pt yet.")
        ckpt = torch.load(ckpt_path, map_location=STATE["device"], weights_only=False)
        m = build_model(pretrained=False, device=STATE["device"])
        m.load_state_dict(ckpt["model"])
        m.eval()
        STATE["model"] = m
        print(f"[api] model loaded (epoch {ckpt.get('epoch','?')})")
    return STATE["model"]


def card(rec):
    """Trimmed record for list views -- drops the 36-vec and the full table."""
    return {
        "pair_id": rec["pair_id"],
        "source": rec.get("source"),
        "image1": rec["image1"],
        "image2": rec["image2"],
        "overlay": rec["overlay"],
        "changed_px": rec["changed_px"],
        "changed_pct_of_frame": rec["changed_pct_of_frame"],
        "description": rec["description"],
        "top_transitions": rec["top_transitions"][:1],
        "metadata": rec["metadata"],
        **({"similarity": rec["similarity"]} if "similarity" in rec else {}),
    }


# --- routes -----------------------------------------------------------------
@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "model_loaded": STATE["model"] is not None,
        "checkpoint_exists": (ROOT / "weights" / "best.pt").exists(),
        "n_records": len(STATE["records"]),
        "index_source": STATE["source"],
        "device": STATE["device"],
    }


@app.get("/api/pairs")
def list_pairs(limit: int = 60, offset: int = 0, sort: str = "changed_pct"):
    recs = STATE["records"]
    if sort == "changed_pct":
        recs = sorted(recs, key=lambda r: -r["changed_pct_of_frame"])
    elif sort == "id":
        recs = sorted(recs, key=lambda r: r["pair_id"])
    return {"total": len(STATE["records"]), "limit": limit, "offset": offset,
            "results": [card(r) for r in recs[offset:offset + limit]]}


@app.get("/api/pairs/{pair_id}")
def get_pair(pair_id: str, source: Optional[str] = None):
    """`source=gt` serves the ground-truth analysis of the same pair, which is what
    backs the Model / Ground Truth toggle in the detail view."""
    suffix = "_gt" if source in ("gt", "ground_truth") else ""
    p = ANALYZED / f"{pair_id}{suffix}.json"
    if not p.exists():
        if suffix:
            raise HTTPException(404, f"no ground-truth analysis for {pair_id}")
        rec = STATE["by_id"].get(pair_id)
        if rec is None:
            raise HTTPException(404, f"unknown pair {pair_id}")
        return rec
    return json.loads(p.read_text())


class Query(BaseModel):
    text: str
    limit: int = 10


@app.post("/api/query")
def query(q: Query):
    f = qparser.parse(q.text, limit=q.limit)
    results, relaxed, note = run_query(STATE["records"], f)
    return {
        "query": q.text,
        # Echoing the parsed filter is the whole defence against a judge typing
        # something odd: they can see exactly how it was read.
        "parsed_filter": f.to_dict(),
        "parsed_summary": f.describe(),
        "relaxed": relaxed,
        "note": note,
        "count": len(results),
        "results": [card(r) for r in results],
    }


@app.get("/api/examples")
def examples():
    """The chips on the landing page. Clicking one is how the demo avoids typos."""
    return {"examples": [
        "where did trees become buildings",
        "vegetation decreased",
        "urbanization in Shanghai",
        "tree loss over 10%",
        "changes in Chengdu",
        "most changed areas",
    ]}


@app.post("/api/analyze")
async def analyze_upload(before: UploadFile = File(...), after: UploadFile = File(...)):
    model = get_model()
    uid = uuid.uuid4().hex[:12]
    out_dir = UPLOADS / uid
    out_dir.mkdir(parents=True, exist_ok=True)

    def read(f, data):
        img = Image.open(io.BytesIO(data)).convert("RGB")
        native = img.size
        if native != (512, 512):
            img = img.resize((512, 512), Image.BILINEAR)
        return np.array(img), native

    im1, size1 = read(before, await before.read())
    im2, size2 = read(after, await after.read())

    # The model only ever saw 512x512 aerial tiles. Anything else is out of
    # distribution and the UI says so rather than quietly producing nonsense.
    ood = (size1 != (512, 512)) or (size2 != (512, 512))

    Image.fromarray(im1).save(out_dir / "before.png")
    Image.fromarray(im2).save(out_dir / "after.png")

    from dataset import normalize
    with torch.no_grad():
        a = torch.from_numpy(normalize(im1))[None].to(STATE["device"])
        b = torch.from_numpy(normalize(im2))[None].to(STATE["device"])
        with torch.autocast("cuda", dtype=torch.bfloat16,
                            enabled=STATE["device"] == "cuda"):
            p1, p2, _ = model.predict(a, b)
    p1 = p1[0].cpu().numpy().astype(np.uint8)
    p2 = p2[0].cpu().numpy().astype(np.uint8)

    save_overlay(out_dir / "overlay.png", im2, p2)

    rec = build_record(
        uid, p1, p2,
        image1=f"/uploads/{uid}/before.png",
        image2=f"/uploads/{uid}/after.png",
        overlay=f"/uploads/{uid}/overlay.png",
        source="model",
    )
    # An uploaded image has no place in the mocked-geography story, so it gets no
    # invented coordinates -- only the fields that are genuinely derived.
    rec["metadata"] = {"synthetic": False, "uploaded": True,
                       "native_size_before": list(size1),
                       "native_size_after": list(size2)}
    rec["description"] = rec["description"].split(". ", 1)[-1] if rec["changed_px"] else \
        "No change was detected between the two uploaded images."

    similar = []
    if STATE["sim"] is not None:
        similar = [card(r) for r in STATE["sim"].query(rec["transition_vec"], k=5)]

    return {
        "record": rec,
        "similar": similar,
        "ood_warning": ood,
        "ood_note": ("Images were not 512x512 and have been resampled. The model was "
                     "trained on 512x512 aerial tiles, so results outside that "
                     "domain are indicative only.") if ood else None,
    }


# --- static -----------------------------------------------------------------
# data/second is a junction to the dataset outside the repo. StaticFiles resolves
# symlinks and refuses anything landing outside its root, so the junction has to
# be mounted at its real path -- and before /media, since mounts match in order.
_SECOND = (DATA / "second").resolve()
if _SECOND.exists():
    app.mount("/media/second", StaticFiles(directory=_SECOND), name="second")
app.mount("/media", StaticFiles(directory=DATA), name="media")
app.mount("/uploads", StaticFiles(directory=UPLOADS), name="uploads")

_FRONTEND = ROOT / "frontend" / "dist"
if _FRONTEND.exists():
    app.mount("/", StaticFiles(directory=_FRONTEND, html=True), name="frontend")
