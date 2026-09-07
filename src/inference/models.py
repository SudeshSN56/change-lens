import os
import torch
import torch.nn as nn
import open_clip
from ..utils.config import settings
from ..utils.logging import get_logger

logger = get_logger(__name__)
_device = "cuda" if torch.cuda.is_available() else "cpu"


class AdapterHeads(nn.Module):
    """Multi-head adapter on top of frozen Prithvi embeddings."""

    def __init__(self, prithvi_dim: int = 768):
        super().__init__()
        self.semantic_head = nn.Linear(prithvi_dim, settings.semantic_dim)
        self.change_classifier = nn.Sequential(
            nn.Linear(prithvi_dim * 2, 256), nn.ReLU(), nn.Linear(256, 1), nn.Sigmoid()
        )
        self.change_embedding_head = nn.Linear(prithvi_dim, settings.change_dim)

    def forward_semantic(self, x):
        return self.semantic_head(x)

    def forward_change(self, before_feat, after_feat):
        pair = torch.cat([before_feat, after_feat], dim=-1)
        score = self.change_classifier(pair).squeeze(-1)
        emb = self.change_embedding_head(after_feat - before_feat)
        emb = emb / (emb.norm(dim=-1, keepdim=True) + 1e-8)
        return score, emb


_remoteclip_model = None
_remoteclip_preprocess = None
_remoteclip_tokenizer = None


def load_remoteclip():
    """RemoteCLIP ships as an OpenCLIP-compatible checkpoint. Download it into
    models/remoteclip/ via scripts/download_models.sh first."""
    global _remoteclip_model, _remoteclip_preprocess, _remoteclip_tokenizer
    if _remoteclip_model is not None:
        return _remoteclip_model, _remoteclip_preprocess, _remoteclip_tokenizer

    ckpt_path = os.path.join(settings.remoteclip_dir, "RemoteCLIP-RN50x4.pt")
    model, _, preprocess = open_clip.create_model_and_transforms("RN50x4", pretrained=None)
    if os.path.exists(ckpt_path):
        state_dict = torch.load(ckpt_path, map_location="cpu")
        model.load_state_dict(state_dict, strict=False)
        logger.info(f"Loaded RemoteCLIP weights from {ckpt_path}")
    else:
        logger.warning(
            f"RemoteCLIP checkpoint not found at {ckpt_path} — "
            f"run scripts/download_models.sh. Using randomly initialized RN50x4 for now."
        )
    tokenizer = open_clip.get_tokenizer("RN50x4")
    model.to(_device).eval()

    _remoteclip_model, _remoteclip_preprocess, _remoteclip_tokenizer = model, preprocess, tokenizer
    return model, preprocess, tokenizer


_prithvi_model = None


def load_prithvi():
    """IBM Prithvi-100M is a ViT-style MAE encoder trained on HLS imagery.
    Weights: https://huggingface.co/ibm-nasa-geospatial/Prithvi-100M
    NOTE: exact state_dict key names depend on the checkpoint revision —
    adjust the `strict=False` load below if you hit key mismatches."""
    global _prithvi_model
    if _prithvi_model is not None:
        return _prithvi_model

    import timm
    ckpt_path = os.path.join(settings.prithvi_dir, "Prithvi_100M.pt")
    model = timm.create_model(
        "vit_base_patch16_224", pretrained=False, num_classes=0, in_chans=6  # HLS: 6 bands
    )
    if os.path.exists(ckpt_path):
        state_dict = torch.load(ckpt_path, map_location="cpu")
        state_dict = state_dict.get("model", state_dict)
        model.load_state_dict(state_dict, strict=False)
        logger.info(f"Loaded Prithvi weights from {ckpt_path}")
    else:
        logger.warning(
            f"Prithvi checkpoint not found at {ckpt_path} — "
            f"run scripts/download_models.sh. Using randomly initialized ViT-B/16 for now."
        )
    model.to(_device).eval()
    _prithvi_model = model
    return model


_adapter_heads = None


def load_adapters() -> AdapterHeads:
    global _adapter_heads
    if _adapter_heads is not None:
        return _adapter_heads

    heads = AdapterHeads()
    if os.path.exists(settings.adapters_path):
        heads.load_state_dict(torch.load(settings.adapters_path, map_location="cpu"))
        logger.info(f"Loaded trained adapter heads from {settings.adapters_path}")
    else:
        logger.warning(
            f"No trained adapters at {settings.adapters_path} — "
            f"run scripts/train_adapters.py first. Using untrained heads for now."
        )
    heads.to(_device).eval()
    _adapter_heads = heads
    return heads
