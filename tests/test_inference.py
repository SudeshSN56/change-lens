import numpy as np
import torch
from src.inference.models import AdapterHeads

def test_adapter_heads_forward_shapes():
    heads = AdapterHeads(prithvi_dim=768)
    before = torch.randn(4, 768)
    after = torch.randn(4, 768)
    score, emb = heads.forward_change(before, after)
    assert score.shape == (4,)
    assert emb.shape[-1] == 64
    assert torch.all((score >= 0) & (score <= 1))

def test_change_embedding_is_normalized():
    heads = AdapterHeads(prithvi_dim=768)
    before = torch.randn(2, 768)
    after = torch.randn(2, 768)
    _, emb = heads.forward_change(before, after)
    norms = emb.norm(dim=-1)
    assert torch.allclose(norms, torch.ones_like(norms), atol=1e-4)
