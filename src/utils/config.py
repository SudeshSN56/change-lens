import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    data_dir: str = os.environ.get("DATA_DIR", "./data")
    models_dir: str = os.environ.get("MODELS_DIR", "./models")
    before_dir: str = os.environ.get("BEFORE_DIR", "./data/before")
    after_dir: str = os.environ.get("AFTER_DIR", "./data/after")
    logs_dir: str = os.environ.get("LOGS_DIR", "./logs")
    redis_url: str = os.environ.get("REDIS_URL", "redis://localhost:6379/0")

    sqlite_path: str = ""
    lancedb_path: str = ""
    remoteclip_dir: str = ""
    prithvi_dir: str = ""
    adapters_path: str = ""

    tile_size: int = 512
    cloud_cover_skip_threshold: float = 0.5
    water_skip_threshold: float = 0.8
    pairing_spatial_tolerance_m: float = 100.0

    semantic_dim: int = 512
    visual_dim: int = 512
    change_dim: int = 64

    def model_post_init(self, __context) -> None:
        self.sqlite_path = os.path.join(self.data_dir, "sqlite.db")
        self.lancedb_path = os.path.join(self.data_dir, "lancedb")
        self.remoteclip_dir = os.path.join(self.models_dir, "remoteclip")
        self.prithvi_dir = os.path.join(self.models_dir, "prithvi")
        self.adapters_path = os.path.join(self.models_dir, "adapters", "adapters.pt")
        for d in [self.data_dir, self.models_dir, self.before_dir, self.after_dir,
                  self.logs_dir, self.lancedb_path]:
            os.makedirs(d, exist_ok=True)

settings = Settings()
