# ChangeLens — Semantic Change Detection + Query Chatbot

Ask a question in plain English about 742 held-out aerial image pairs and get back
the ones that match, with a per-category breakdown of what turned into what.

Built on the **SECOND** dataset: 2,968 co-registered 512×512 aerial pairs over
Hangzhou, Chengdu and Shanghai, each with two 7-class land-cover maps that are
labelled **only inside changed regions**.

---

## What it does

| | |
|---|---|
| **Model** | Siamese ResNet-18 / U-Net — two semantic heads (6 classes) + one binary change head |
| **Search** | Rule-based query parser over a precomputed JSON index. No inference at query time, no LLM anywhere |
| **Upload** | Analyze any two images live, then find the 5 most similar changes already in the index |

### Two things that are easy to get wrong, and how they're handled

**1. No-change dominates.** 78.7% of pixels are unchanged (measured over 300
pairs) and both label maps mark exactly the same region. A naive 7-class head
learns to answer "no-change" everywhere and scores 78.7% while being useless.
Here the semantic heads predict **six** classes and are supervised only inside
changed pixels (`ignore_index=-1`); the binary head owns the change question.

**2. The percentages are shares of the changed area, not of the frame.** SECOND
labels land cover only where something changed, so "buildings: 44%" means 44% of
the *changed region*. Every table in the UI prints its denominator
(`changed_px` and `changed_pct_of_frame`) directly above itself.

### Honesty guarantees

- **Nothing the chatbot returns was ever trained on.** The 742 searchable pairs
  are the held-out split, listed in `data/splits/test.txt`.
- **Geolocation, dates and sensor are synthetic** — SECOND ships without them.
  Every record carries `"synthetic": true` and the UI renders a `SYNTHETIC`
  badge next to every coordinate. The *city* is the real capture region; the
  precise point is invented, deterministically, from the pair id.
- **Ground truth is never passed off as model output.** Records are stamped
  `"source": "model"` or `"source": "ground_truth"` and the detail view badges
  which one you are looking at.

---

## Setup

Requires Python 3.11 with a CUDA build of PyTorch, and Node 18+.

```bash
py -3.11 -m venv .venv --system-site-packages
./.venv/Scripts/python.exe -m pip install -r requirements.txt
```

The SECOND dataset lives outside the repo. Point `data/second` at it:

```bash
cmd /c mklink /J "data\second" "C:\dataa\second"    # Windows junction
```

It must contain `im1/`, `im2/`, `label1/`, `label2/`, each with the same 2,968
`<id>.png` filenames.

### The pretrained weights are on disk, not on the network

`weights/resnet18_imagenet.pt` is committed. `model.py` loads from that file and
never calls `weights=...`, so training and inference both work with the wifi off.
If it is ever missing:

```bash
python -c "import torch,torchvision as tv; torch.save(tv.models.resnet18(weights=tv.models.ResNet18_Weights.IMAGENET1K_V1).state_dict(),'weights/resnet18_imagenet.pt')"
```

---

## Running it

```bash
# 1. split — writes data/splits/{train,test}.txt once, then refuses to overwrite
python src/make_split.py

# 2. train — ~2 h for 40 epochs on an 8 GB RTX 4060
PYTHONPATH=src python src/train.py

# 3. precompute — 742 records + 742 overlays, no inference needed afterwards
PYTHONPATH=src python src/analyze.py                # model  -> index.json
PYTHONPATH=src python src/analyze.py --source gt    # truth  -> index_gt.json

# 4. serve
./.venv/Scripts/uvicorn.exe api:app --app-dir src --port 8000

# 5. UI
cd frontend && npm install && npm run dev           # http://localhost:5173
```

`analyze.py` reads `weights/best.pt`. The API falls back to `index_gt.json` if
`index.json` does not exist yet, so the query and gallery views work before the
model has finished training.

---

## API

| Method | Route | Returns |
|---|---|---|
| GET | `/api/health` | `{status, model_loaded, n_records, index_source, device}` |
| GET | `/api/pairs?limit=&offset=&sort=` | Gallery cards |
| GET | `/api/pairs/{id}?source=gt` | Full record; `source=gt` backs the Model/GT toggle |
| POST | `/api/query` `{text, limit}` | `{parsed_filter, parsed_summary, results, relaxed, note}` |
| POST | `/api/analyze` (2 files) | `{record, similar[], ood_warning}` |
| GET | `/api/examples` | The landing-page chips |
| GET | `/media/*`, `/uploads/*` | Static images |

`/api/query` **echoes the parsed filter back** as `parsed_summary`, and the UI
renders it. That is what makes a rule-based parser a feature rather than a
limitation: every result is explainable.

### The fallback ladder

A query that matches nothing is relaxed one constraint at a time — threshold,
then dates, then geography, then the exact transition, then direction — and the
response is marked `relaxed: true` with a human-readable note. An empty screen
reads as broken software; "no exact match, here's the closest" reads as a
considered product.

---

## Query patterns

| Example | Parsed as |
|---|---|
| `vegetation decreased` | categories tree + low vegetation, direction decrease |
| `where buildings increased` | category buildings, direction increase |
| `tree loss over 10%` | + threshold 10 pp |
| `trees became buildings` | transition tree → buildings |
| `vegetation converted to bare ground` | transition {tree, low veg} → ground |
| `changes in Chengdu` | region filter |
| `within 20 km of 30.28, 120.15` | centre + radius |
| `between 2015 and 2018` | date range |
| `most changed areas` | sort by total change |
| `deforestation`, `urbanization` | named transition aliases |

---

## Layout

```
src/
  classes.py    class palette, RGB↔index LUT, query vocabulary — imported everywhere
  dataset.py    paired loading + augmentation (incl. temporal swap)
  model.py      Siamese ResNet-18/U-Net; shared by train and serve
  metrics.py    binary mIoU, SeK, per-class IoU
  train.py      40 epochs, bf16, cosine + warmup, best-by-SeK
  analyze.py    record schema + precompute; build_record() is shared with /api/analyze
  overlay.py    the baked 512×512 overlay PNG
  metadata.py   deterministic synthetic geo/date/sensor
  parser.py     rule-based NL → Filter
  search.py     filtering, ranking, fallback ladder, cosine similarity
  api.py        FastAPI
```

`classes.py` and `model.py` are imported by both the training and the serving
paths, so class ordering and architecture can never drift between them.
