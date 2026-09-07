import logging
import os
from .config import settings

def get_logger(name: str) -> logging.Logger:
    logger = logging.getLogger(name)
    if logger.handlers:
        return logger
    logger.setLevel(logging.INFO)

    fmt = logging.Formatter("%(asctime)s | %(levelname)s | %(name)s | %(message)s")

    stream_handler = logging.StreamHandler()
    stream_handler.setFormatter(fmt)
    logger.addHandler(stream_handler)

    os.makedirs(settings.logs_dir, exist_ok=True)
    file_handler = logging.FileHandler(os.path.join(settings.logs_dir, "app.log"))
    file_handler.setFormatter(fmt)
    logger.addHandler(file_handler)

    return logger
