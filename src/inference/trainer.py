"""Adapter head training on a LEVIR-CD-style before/after/label dataset.

Expected dataset layout:
    dataset/
      before/*.png
      after/*.png
      label/*.png   (binary mask: 255 = changed pixel)

Usage: python scripts/train_adapters.py --dataset ./dataset --epochs 20
"""
import os
import random
import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
from PIL import Image
import numpy as np

from .models import load_prithvi, AdapterHeads
from .encoder import _prithvi_features
from ..utils.config import settings
from ..utils.logging import get_logger

logger = get_logger(__name__)
_device = "cuda" if torch.cuda.is_available() else "cpu"


class ChangeDataset(Dataset):
    def __init__(self, root: str):
        self.before_dir = os.path.join(root, "before")
        self.after_dir = os.path.join(root, "after")
        self.label_dir = os.path.join(root, "label")
        self.filenames = sorted(os.listdir(self.before_dir))

    def __len__(self):
        return len(self.filenames)

    def __getitem__(self, idx):
        name = self.filenames[idx]
        before_path = os.path.join(self.before_dir, name)
        after_path = os.path.join(self.after_dir, name)
        label_path = os.path.join(self.label_dir, name)

        label_img = np.array(Image.open(label_path).convert("L"))
        label = 1.0 if (label_img > 127).mean() > 0.01 else 0.0  # tile-level binary label

        return before_path, after_path, label


def contrastive_loss(before_feat, after_feat, labels, margin: float = 1.0):
    dist = (before_feat - after_feat).norm(dim=-1)
    # changed pairs (label=1) should be far apart; unchanged (label=0) close
    loss = labels * dist.pow(2) + (1 - labels) * torch.clamp(margin - dist, min=0).pow(2)
    return loss.mean()


def train(dataset_root: str, epochs: int = 20, lr: float = 1e-4, batch_size: int = 8):
    dataset = ChangeDataset(dataset_root)
    indices = list(range(len(dataset)))
    random.shuffle(indices)
    split = int(0.8 * len(indices))
    train_idx, val_idx = indices[:split], indices[split:]

    load_prithvi()  # frozen backbone, used only for feature extraction below
    heads = AdapterHeads().to(_device)
    optimizer = torch.optim.Adam(heads.parameters(), lr=lr)
    bce = nn.BCELoss()

    for epoch in range(epochs):
        heads.train()
        random.shuffle(train_idx)
        total_loss = 0.0

        for i in range(0, len(train_idx), batch_size):
            batch_idx = train_idx[i : i + batch_size]
            before_feats, after_feats, labels = [], [], []
            for idx in batch_idx:
                before_path, after_path, label = dataset[idx]
                before_feats.append(_prithvi_features(before_path))
                after_feats.append(_prithvi_features(after_path))
                labels.append(label)

            before_feats = torch.tensor(np.stack(before_feats), dtype=torch.float32).to(_device)
            after_feats = torch.tensor(np.stack(after_feats), dtype=torch.float32).to(_device)
            labels_t = torch.tensor(labels, dtype=torch.float32).to(_device)

            score, emb = heads.forward_change(before_feats, after_feats)
            loss = bce(score, labels_t) + contrastive_loss(before_feats, after_feats, labels_t)

            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            total_loss += loss.item()

        logger.info(f"Epoch {epoch+1}/{epochs} — train loss: {total_loss:.4f}")

    os.makedirs(os.path.dirname(settings.adapters_path), exist_ok=True)
    torch.save(heads.state_dict(), settings.adapters_path)
    logger.info(f"Saved adapter heads to {settings.adapters_path}")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", required=True)
    parser.add_argument("--epochs", type=int, default=20)
    args = parser.parse_args()
    train(args.dataset, epochs=args.epochs)
