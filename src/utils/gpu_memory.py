import functools
from .logging import get_logger

logger = get_logger(__name__)

def get_free_vram_mb() -> float:
    try:
        import torch
        if not torch.cuda.is_available():
            return float("inf")  # CPU: no VRAM ceiling to respect
        free, total = torch.cuda.mem_get_info()
        return free / (1024 ** 2)
    except Exception:
        return float("inf")

def safe_batch_size(desired: int, min_batch: int = 1, mb_per_item: float = 50.0) -> int:
    free_mb = get_free_vram_mb()
    if free_mb == float("inf"):
        return desired
    max_by_mem = max(min_batch, int(free_mb // mb_per_item))
    return max(min_batch, min(desired, max_by_mem))

def retry_on_oom(fn):
    """Decorator: on CUDA OOM, halve batch_size kwarg and retry until min_batch=1."""
    @functools.wraps(fn)
    def wrapper(*args, batch_size: int = 8, **kwargs):
        import torch
        bs = batch_size
        while bs >= 1:
            try:
                return fn(*args, batch_size=bs, **kwargs)
            except RuntimeError as e:
                if "out of memory" in str(e).lower() and bs > 1:
                    torch.cuda.empty_cache()
                    bs = bs // 2
                    logger.warning(f"CUDA OOM — retrying with batch_size={bs}")
                    continue
                raise
        raise RuntimeError("OOM persisted even at batch_size=1")
    return wrapper
