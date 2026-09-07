#!/bin/bash
set -e

MODELS_DIR="${MODELS_DIR:-./models}"
mkdir -p "$MODELS_DIR/remoteclip" "$MODELS_DIR/prithvi" "$MODELS_DIR/adapters"

echo "== RemoteCLIP =="
echo "Download RemoteCLIP-RN50x4.pt from the RemoteCLIP release page:"
echo "  https://github.com/ChenDelong1999/RemoteCLIP"
echo "and place it at: $MODELS_DIR/remoteclip/RemoteCLIP-RN50x4.pt"
echo "(no stable direct-download URL — the repo gates it via Google Drive/HF, grab manually)"

echo "== Prithvi-100M =="
python3 - <<'PYEOF'
from huggingface_hub import hf_hub_download
import os

models_dir = os.environ.get("MODELS_DIR", "./models")
path = hf_hub_download(
    repo_id="ibm-nasa-geospatial/Prithvi-100M",
    filename="Prithvi_100M.pt",
    local_dir=os.path.join(models_dir, "prithvi"),
)
print(f"Downloaded Prithvi-100M to {path}")
PYEOF

echo "Done. Adapter heads (models/adapters/adapters.pt) are NOT pretrained —"
echo "run scripts/train_adapters.py against a LEVIR-CD style dataset."
