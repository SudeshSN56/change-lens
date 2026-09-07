import torch
import numpy as np
from PIL import Image
from .models import load_remoteclip, load_prithvi, load_adapters
from ..utils.gpu_memory import retry_on_oom
from ..utils.logging import get_logger

logger = get_logger(__name__)
_device = "cuda" if torch.cuda.is_available() else "cpu"


@torch.no_grad()
def embed_semantic_visual(image_path: str):
    """RemoteCLIP embedding — used for both text-to-image and image-to-image search."""
    model, preprocess, _ = load_remoteclip()
    img = Image.open(image_path).convert("RGB")
    tensor = preprocess(img).unsqueeze(0).to(_device)
    feat = model.encode_image(tensor)
    feat = feat / feat.norm(dim=-1, keepdim=True)
    vec = feat.squeeze(0).cpu().numpy()
    return vec, vec  # semantic, visual (RemoteCLIP produces one joint embedding space)


@torch.no_grad()
def embed_text(query: str):
    model, _, tokenizer = load_remoteclip()
    tokens = tokenizer([query]).to(_device)
    feat = model.encode_text(tokens)
    feat = feat / feat.norm(dim=-1, keepdim=True)
    return feat.squeeze(0).cpu().numpy()


@torch.no_grad()
def _prithvi_features(image_path: str) -> np.ndarray:
    """Run Prithvi backbone to get a pooled feature vector for change detection.
    Prithvi expects 6-band HLS input; for plain RGB imagery we replicate/pad
    channels — replace with real multispectral bands for production use."""
    prithvi = load_prithvi()
    img = Image.open(image_path).convert("RGB").resize((224, 224))
    arr = np.array(img).astype(np.float32) / 255.0
    arr = np.transpose(arr, (2, 0, 1))
    arr6 = np.concatenate([arr, arr], axis=0)  # pad RGB -> 6 channels
    tensor = torch.from_numpy(arr6).unsqueeze(0).to(_device)
    feat = prithvi.forward_features(tensor)
    if feat.dim() == 3:
        feat = feat.mean(dim=1)  # pool tokens
    return feat.squeeze(0).cpu().numpy()


@torch.no_grad()
def compute_change_score_and_embedding(before_path: str, after_path: str):
    adapters = load_adapters()
    before_feat = torch.from_numpy(_prithvi_features(before_path)).unsqueeze(0).to(_device)
    after_feat = torch.from_numpy(_prithvi_features(after_path)).unsqueeze(0).to(_device)
    score, emb = adapters.forward_change(before_feat, after_feat)
    return float(score.item()), emb.squeeze(0).cpu().numpy()


@retry_on_oom
def embed_batch(image_paths: list, batch_size: int = 8):
    """Batch semantic/visual embedding with OOM-halving retry (see gpu_memory.py)."""
    results = []
    for i in range(0, len(image_paths), batch_size):
        chunk = image_paths[i : i + batch_size]
        for path in chunk:
            sem, vis = embed_semantic_visual(path)
            results.append((path, sem, vis))
        if _device == "cuda":
            torch.cuda.empty_cache()
    return results
