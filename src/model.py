"""Siamese ResNet-18 / U-Net with two semantic heads and one change head.

Imported by both train.py and analyze.py/api.py so the architecture can never
drift between training and serving.

    im1 --+
          +-- shared encoder -> shared decoder -> f1, f2  (64ch, 512x512)
    im2 --+
                head_sem (1x1, 6 out)  applied to f1 and f2 separately
                head_chg (1x1, 1 out)  on  |f1-f2| (+) f1*f2

The semantic heads predict SIX classes, not seven. No-change is ~79% of pixels
(measured over 300 pairs) and is identical in both label maps, so a 7-class head
would learn to answer "no-change" everywhere and score ~79% while being useless.
The binary head owns that question instead, and the semantic heads are only ever
supervised inside changed regions.
"""

from pathlib import Path

import torch
import torch.nn as nn
import torch.nn.functional as F
import torchvision

from classes import N_SEM

ROOT = Path(__file__).resolve().parents[1]
LOCAL_RESNET18 = ROOT / "weights" / "resnet18_imagenet.pt"


def _conv_block(cin, cout):
    return nn.Sequential(
        nn.Conv2d(cin, cout, 3, padding=1, bias=False),
        nn.BatchNorm2d(cout),
        nn.ReLU(inplace=True),
        nn.Conv2d(cout, cout, 3, padding=1, bias=False),
        nn.BatchNorm2d(cout),
        nn.ReLU(inplace=True),
    )


class Encoder(nn.Module):
    """ResNet-18 trunk exposing features at 1/2, 1/4, 1/8, 1/16 and 1/32."""

    def __init__(self, pretrained=True):
        super().__init__()
        r = torchvision.models.resnet18(weights=None)
        if pretrained:
            if not LOCAL_RESNET18.exists():
                raise FileNotFoundError(
                    f"{LOCAL_RESNET18} missing. Weights are loaded from disk, never "
                    f"fetched, so the demo works with the wifi off. Re-create it with:\n"
                    f"  python -c \"import torch,torchvision as tv;"
                    f"torch.save(tv.models.resnet18(weights=tv.models.ResNet18_Weights."
                    f"IMAGENET1K_V1).state_dict(),r'{LOCAL_RESNET18}')\""
                )
            r.load_state_dict(torch.load(LOCAL_RESNET18, map_location="cpu", weights_only=True))
        self.stem = nn.Sequential(r.conv1, r.bn1, r.relu)   # 64ch  @ 1/2
        self.pool = r.maxpool
        self.layer1 = r.layer1                              # 64ch  @ 1/4
        self.layer2 = r.layer2                              # 128ch @ 1/8
        self.layer3 = r.layer3                              # 256ch @ 1/16
        self.layer4 = r.layer4                              # 512ch @ 1/32

    def forward(self, x):
        x0 = self.stem(x)
        c1 = self.layer1(self.pool(x0))
        c2 = self.layer2(c1)
        c3 = self.layer3(c2)
        c4 = self.layer4(c3)
        return x0, c1, c2, c3, c4


class Decoder(nn.Module):
    """U-Net decoder back to full resolution, 64 output channels."""

    def __init__(self, out_ch=64):
        super().__init__()
        self.d3 = _conv_block(512 + 256, 256)
        self.d2 = _conv_block(256 + 128, 128)
        self.d1 = _conv_block(128 + 64, 64)
        self.d0 = _conv_block(64 + 64, 64)
        self.out = _conv_block(64, out_ch)

    @staticmethod
    def _up_to(x, ref):
        return F.interpolate(x, size=ref.shape[-2:], mode="bilinear", align_corners=False)

    def forward(self, feats):
        x0, c1, c2, c3, c4 = feats
        x = self.d3(torch.cat([self._up_to(c4, c3), c3], 1))
        x = self.d2(torch.cat([self._up_to(x, c2), c2], 1))
        x = self.d1(torch.cat([self._up_to(x, c1), c1], 1))
        x = self.d0(torch.cat([self._up_to(x, x0), x0], 1))
        x = F.interpolate(x, scale_factor=2, mode="bilinear", align_corners=False)
        return self.out(x)


class SCDNet(nn.Module):
    def __init__(self, pretrained=True, feat_ch=64):
        super().__init__()
        self.encoder = Encoder(pretrained)
        self.decoder = Decoder(feat_ch)
        self.head_sem = nn.Conv2d(feat_ch, N_SEM, 1)
        self.head_chg = nn.Conv2d(feat_ch * 2, 1, 1)

    def forward(self, im1, im2):
        f1 = self.decoder(self.encoder(im1))
        f2 = self.decoder(self.encoder(im2))
        # Absolute difference finds "something happened here"; the product finds
        # "these two look alike". Together they separate change from co-registration
        # noise better than either alone.
        pair = torch.cat([(f1 - f2).abs(), f1 * f2], 1)
        return self.head_sem(f1), self.head_sem(f2), self.head_chg(pair)

    @torch.no_grad()
    def predict(self, im1, im2, thresh=0.5):
        """-> (y1, y2, change) as int64 0..6 maps, semantics zeroed outside change."""
        sem1, sem2, chg = self.forward(im1, im2)
        change = (torch.sigmoid(chg[:, 0]) > thresh)
        p1 = sem1.argmax(1) + 1
        p2 = sem2.argmax(1) + 1
        return p1 * change, p2 * change, change


def build_model(pretrained=True, device="cuda"):
    return SCDNet(pretrained=pretrained).to(device)
