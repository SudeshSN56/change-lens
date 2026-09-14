# Change Lens — Complete Project Dossier

> Everything about the project in one place: the brief, how the approach changed over time, dataset,
> model, training runs, results, analysis pipeline, search, API, frontend, setup, testing,
> problems we hit and how we fixed them, files, limitations, future work, and a slide-by-slide
> outline for the presentation (Part 17).
>
> Sources: the repository itself (`README.md`, `CLAUDE.md`, `setup.txt`, `start.ps1`, source code,
> `weights/final_metrics.json`, `weights/history.json`, `data/analyzed/index.json`, `data/class_weights.json`,
> training/analysis logs and git history). Numbers are copied from those files, not estimated.

---

## Contents

1. Project summary
2. The problem statement (the brief) and what it asks for
3. Project history: how the approach changed
4. Dataset: SECOND
5. Data split
6. Model architecture
7. Training: setup, losses, augmentation, options
8. Training runs 1, 2 and 3
9. Evaluation: metrics and results
10. Offline analysis and the per-pair record
11. Natural-language search: parser, ranking, fallback, similarity
12. Backend API
13. Frontend: the command console
14. Environment, setup and the one-command launcher
15. Testing and verification done
16. Problems we hit and how we fixed them
17. Presentation slide outline
18. How the system maps to the brief (coverage and gaps)
19. Key engineering decisions
20. Limitations and future work
21. Files, artefacts, sizes and timings
22. Git timeline

---

## 1. Project summary

**Change Lens: semantic change detection with a natural-language query console.**

- Takes two aerial images of the same place (before/after) and detects **where** the land changed and
  **what it changed into** (e.g. trees → buildings, farmland → bare ground).
- All 742 held-out test pairs are analysed once, offline. An analyst can then ask in plain English
  ("where did trees become buildings", "urbanization in Shanghai", "tree loss over 10%") and get
  explainable, ranked results in milliseconds.
- New image pairs can also be uploaded and analysed live (~3.6 s on GPU), with the 5 most similar
  changes already in the index returned alongside.
- Stack: **Python 3.11 / PyTorch 2.5.1 (CUDA 12.1)** model, **FastAPI** backend, **React 19 + Vite 8**
  "command console" frontend with hand-drawn SVG charts and no extra UI libraries.
- Headline result: test **SeK 0.144 → 0.192 (+33 %)** from run 1 to run 3; change recall 0.53 → 0.67.
- Works fully offline: pretrained weights load from disk, no LLM or cloud API anywhere.

---

## 2. The problem statement (the brief)

The project started from a challenge brief (saved in the repo's early README, commit `4010a3d`).
Summary of what it asks for:

**Background.** Earth-observation archives are growing fast (multi-temporal, multi-spectral,
multi-sensor). Normal catalogues search by metadata (coordinates, date, platform), so analysts must
already know where and when to look. Foundation models make search *by meaning* possible, but a
reliable on-premises system has to ingest new imagery incrementally, keep geospatial provenance, and
suppress false change from season, atmosphere, viewing geometry, registration error and sensor differences.

**Six required capabilities:**

| # | Capability | What the brief asks |
|---|---|---|
| 2.2.1 | Semantic & multimodal retrieval | Free-text search over tiles + image-to-image search, ranked, refinable by AOI / date / sensor. Example: "newly built structures near a river" |
| 2.2.2 | Multi-temporal change analysis | Find appearance / disappearance / expansion / contraction; classify change type (construction, clearance, water extent, roads); estimate earliest observation supporting the change |
| 2.2.3 | False-alarm suppression | Treat season, illumination, view angle, cloud, haze, snow, shadow, radiometry, misregistration as confounders; prefer precision over indiscriminate recall |
| 2.2.4 | Discovery & clustering | Group similar sites so one site of interest leads to others without writing new queries |
| 2.2.5 | Analyst workflow & provenance | Ranked review queue with before/after evidence, location, time, sensor, confidence, processing history; confirm/reject with audit trail; exports keep provenance |
| 2.2.6 | Scale, incremental ingestion, sovereignty | Vector/equivalent indexing, add new imagery without full rebuild, fully on-prem, GeoTIFF / COG input |

**Constraints (2.2.7):** the whole demo must run with the network disabled once models, libraries and
data are staged locally. Public pretrained models allowed with origin and licence declared. Only public
imagery.

**Expected solution (2.3):** a working demo over an organiser-defined area and time span; retrieval judged
on held-out queries, change analysis on held-out labelled change/no-change cases. Teams submit source
code, an architecture note, index-build and incremental-ingestion procedure, model and dataset
provenance, and an evaluation report stating the indexed area, number of tiles, build time, storage
footprint, query latency and hardware used.

How well Change Lens covers each point is in **Part 18**.

---

## 3. Project history: how the approach changed

### Phase 0 — Brief and planning (2026-09-05)
- Repository created; brief pasted into the README; early idea notes ("water bodies satellite imaging").

### Phase 1 — First design: foundation-model archive search (2026-09-07)
Commit `c2bf2b1` "Add complete change-lens project" scaffolded a large, generic architecture
(73 files, documented in `docs/architecture.md` at that commit):
- **Ingestion:** watchdog poller on `data/before/` and `data/after/`, GDAL/rasterio COG reader
  with WGS84 bounds, 512×512 tile extractor that skipped cloudy/water tiles, tile pairing by grid
  position (fallback: nearest centroid within 100 m).
- **Inference:** Celery tasks running **RemoteCLIP** (semantic/visual embeddings) and **Prithvi** +
  adapter heads (change score + 64-dim change embedding).
- **Storage:** SQLite (scenes, tiles, change_pairs, review_decisions, provenance) + **LanceDB** vectors.
- **API / UI:** FastAPI routes (search, review, export GeoJSON, health) and a Tailwind React UI with
  SearchPanel, ReviewQueue, DiscoveryPanel, StatsBar. Docker + docker-compose, pytest tests.
- Follow-ups: `787933a` fixed Windows ingestion environment setup, `7582712` let the API start without
  eagerly loading the model.
- **Why it was dropped:** its own architecture note listed the problems. Adapter heads shipped
  untrained, the Prithvi checkpoint key mapping was unverified, and tiles were embedded from whole
  scenes, not per-tile crops. It had no labelled data to train or evaluate on, so nothing about its
  output could be measured.

### Phase 2 — Reset (2026-09-11)
- The repo contents were removed (`ed908a1`, `cd73456`). A stray "tic-tac-toe game" commit (`f0ff00d`)
  landed and was removed in the same clean-up.

### Phase 3 — Change Lens rebuilt on SECOND (2026-09-12)
- `9763831` / `090728f` / `b98c201`: new, focused project. We chose a labelled semantic-change dataset
  (SECOND) so the model could be trained **and scored**, and swapped the embedding search for a
  precomputed, explainable index. Contents: dataset wiring, classes, split, Siamese U-Net, SCD
  metrics, training loop, analysis pipeline, overlays, synthetic metadata, rule-based parser, search,
  FastAPI, first React UI.
- **Run 1** trained (ResNet-18, 40 epochs) → test SeK 0.144; first `index.json` and `index_gt.json` built.

### Phase 4 — Model improvements + UI redesign (2026-09-13)
- Diagnosed run 1 (change head under-predicts). **Run 2** (pos_weight only) died at epoch 1.
- All fixes folded into **run 3** (ResNet-34, BCE pos_weight + Dice, consistency loss, val split, TTA,
  threshold sweep, smoke test), launched 00:51, finished ~20:35 (~18 h).
- Frontend redesigned into a "command console" for a defence/planning commander (commit `0476656`).
- Run 3 evaluated, `index.json` rebuilt from it, full flow checked, same-origin API for the built UI,
  `requirements.txt`, `.gitignore`, README (commit `1f6082b`). Docs updated (`b15fa4e`, `dadd719`).

### Phase 5 — Packaging (2026-09-14)
- One-command launcher `start.bat` / `start.ps1`, `setup.txt` step 0, `.claude/commands/run.md`
  (a `/run` command for Claude sessions), this dossier.

---

## 4. Dataset: SECOND

- **SECOND** (SEmantic Change detectiON Dataset): **2,968** co-registered aerial image pairs,
  **512 × 512** px RGB, over **Hangzhou, Chengdu and Shanghai** (China).
- Folders: `im1/`, `im2/` (before/after images), `label1/`, `label2/` (colour label maps), same
  `<id>.png` names in all four.
- Stored outside the repo: `data/second` is a junction/symlink to `C:\dataa\second`
  (`mklink /J data\second C:\dataa\second`).
- Each pair has two label maps (before/after) with **7 classes** (`src/classes.py`, the single source of truth):

| Index | Class | Colour (RGB) |
|---|---|---|
| 0 | no-change | white (255,255,255) |
| 1 | non-vegetated ground | grey (128,128,128) |
| 2 | tree | bright green (0,255,0) |
| 3 | low vegetation | dark green (0,128,0) |
| 4 | water | blue (0,0,255) |
| 5 | buildings | maroon (128,0,0) |
| 6 | playgrounds | red (255,0,0) |

- **Key quirk:** land cover is labelled **only inside changed regions**. Both label maps mark exactly the
  same changed area; everything else is "no-change". `dataset.py` asserts this for every sample.
- `classes.py` converts RGB ↔ index with a packed-integer lookup (`rgb_to_index(strict=True)` fails
  loudly on unknown colours).
- **Class balance** (`data/class_weights.json`, counted over all 2,226 training pairs × 2 label maps
  = 1,167,065,088 pixels):

| Class | Pixels | Share of all px | Share of changed px |
|---|---|---|---|
| no-change | 933,238,316 | **80.0 %** | — |
| non-vegetated ground | 84,016,177 | 7.2 % | 35.9 % |
| buildings | 69,029,746 | 5.9 % | 29.5 % |
| low vegetation | 57,580,471 | 4.9 % | 24.6 % |
| tree | 19,003,524 | 1.6 % | 8.1 % |
| water | 2,760,186 | 0.24 % | 1.2 % |
| playgrounds | 1,436,668 | 0.12 % | 0.6 % |

  (A quick check over 300 pairs gave 78.7 % no-change, the figure quoted in the README.)
- The dataset ships **no geolocation, dates or sensor info** → metadata is synthetic (Part 10).

---

## 5. Data split

| Split | Pairs | Used for |
|---|---|---|
| train.txt → "fit" | 2,003 | gradient updates |
| train.txt → "val" (every 10th id) | 223 | choosing the best epoch + tuning the change threshold |
| **test.txt** | **742** | final reported scores **and** the searchable index |

- Written **once** by `src/make_split.py` (seeded), which refuses to overwrite. `data/splits/test.txt` on
  disk proves that nothing the UI returns was trained on. **Never regenerate it.**
- The val slice is carved in memory in `dataset.read_ids`, so the on-disk split never changes.
- Test data is used for **neither** training **nor** model selection, only for the final report.
- The launcher (`start.ps1`) writes a split only if `data/splits` is missing.

---

## 6. Model architecture

**Siamese ResNet-34 U-Net with 2 semantic heads + 1 change head** (`src/model.py`, `SCDNet`)

```
im1 ──┐                                              head_sem (1×1 conv, 6 classes) on f1
      ├─ shared ResNet encoder ─ shared U-Net ─ f1, f2 (64 ch, 512×512)
im2 ──┘   (ImageNet init)        decoder        head_sem (same weights) on f2
                                                head_chg (1×1 conv, 1 logit) on [ |f1−f2| , f1·f2 ]
```

- **Encoder** (`Encoder`): torchvision ResNet-18 or ResNet-34 trunk (`--backbone`), features at
  1/2, 1/4, 1/8, 1/16, 1/32 (64→512 channels), weights shared across both dates (Siamese).
- **Decoder** (`Decoder`): U-Net with skip connections, conv blocks (`_conv_block`), 4 upsampling
  stages + final ×2 → full resolution, 64 channels.
- **Change head input:** absolute difference `|f1 − f2|` ("something happened") concatenated with the
  product `f1 · f2` ("these look alike"). Together they separate real change from co-registration
  noise better than either alone.
- **ImageNet weights come from disk** (`local_weights()` → `weights/resnet{18,34}_imagenet.pt`) and are
  never downloaded, so it works offline. The ResNet-18 file is committed; the ResNet-34 file (87 MB) is
  too big and can be recreated with one `torch.save` line (README).
- **Prediction** (`predict` / `predict_probs`): optional 4-way flip TTA, sigmoid change probability vs
  threshold, semantic argmax + 1 zeroed outside the predicted change mask → classes 0..6 matching
  the dataset format.
- **Checkpoints** store model weights, training args (including backbone), and the tuned `thresh` and
  `tta`. `load_checkpoint()` reads them, so run 1 (ResNet-18) checkpoints still load.
- Model sizes on disk: run 1 `best.pt` 174 MB (ResNet-18), run 3 `best.pt` 295 MB (ResNet-34).

### Why six classes, not seven
- A naive 7-class head learns to say "no-change" everywhere and scores **~79–80 % accuracy while being useless**.
- So the **semantic heads predict only the 6 land-cover classes** and are supervised **only on changed
  pixels** (`ignore_index = -1` elsewhere). The **binary change head owns "did it change?"**.
- Imbalance inside the 6 classes is handled with **inverse-square-root frequency class weights**
  (`compute_class_weights`, cached in `data/class_weights.json`). Without them water and playgrounds are
  never predicted.

---

## 7. Training: setup, losses, augmentation, options

### Setup
| Setting | Value |
|---|---|
| Optimiser | AdamW, lr 3e-4, weight decay 1e-4 |
| Schedule | 5 % linear warm-up, then cosine decay (`make_scheduler`) |
| Precision | bfloat16 autocast on CUDA |
| Batch size | 8 |
| Seed | 1337 |
| Hardware | 8 GB RTX 4060 laptop GPU, Windows 11 |
| Speed (run 3) | ~3 s/iteration, ~13–14 min/epoch (250 iters + val), ~18 h for 80 epochs |
| Checkpointing | `last.pt` every epoch, `best.pt` when val SeK improves, `history.json` per-epoch metrics |

### Loss (run 3)
Total = semantic CE + change loss + consistency loss

1. **Semantic cross-entropy** (both dates, class-weighted), changed pixels only.
2. **Change loss = BCE with `pos_weight ≈ 2.0` + soft Dice** (`dice_loss`, `--dice-weight 1`).
   `pos_weight` is computed from the data (changed ≈ 20 %). BCE scores pixels independently and
   tends to under-predict; Dice scores overlap directly.
3. **Semantic-consistency loss** (`consistency_loss`, idea from Bi-SRNet, `--sc-weight 1`): cosine
   similarity between the two dates' softmax outputs, **pulled together** on unchanged pixels
   (~80 % of the frame, otherwise never supervised) and **pushed apart** where the class actually
   changed. Changed-but-same-class pixels (e.g. a rebuilt building) are ignored.

### Augmentation (`src/dataset.py`, `SecondDataset`)
- **Temporal swap** (p = 0.5): swap before/after images and labels. Doubles the data for free and
  teaches the change head that change is symmetric.
- Horizontal flip, vertical flip, random 90° rotations, applied identically to all 4 arrays. Labels are
  only flipped/indexed, never resampled.
- **Independent brightness/contrast jitter (±20 %) per image** (`_jitter`), which mimics two different
  sensors or lighting conditions.
- ImageNet normalisation (`normalize`).

### Command-line options (`src/train.py`)
| Option | Default | Meaning |
|---|---|---|
| `--epochs` | 40 | number of epochs |
| `--batch-size` | 8 | batch size |
| `--lr` / `--wd` | 3e-4 / 1e-4 | learning rate / weight decay |
| `--workers` | 4 | dataloader workers |
| `--seed` | 1337 | random seed |
| `--backbone` | resnet18 | `resnet18` or `resnet34` |
| `--chg-weight` | 1.0 | weight of the change loss |
| `--pos-weight` | auto | BCE positive weight (auto from data if omitted) |
| `--dice-weight` | 1.0 | soft Dice weight |
| `--sc-weight` | 1.0 | consistency loss weight |
| `--freeze-encoder` | off | freeze the backbone |
| `--eval-batches` | 0 (all) | cap evaluation batches |
| `--resume` | — | resume from a checkpoint (e.g. `weights/last.pt`) |
| `--smoke` | off | ~1-minute end-to-end check into `weights/smoke/` |

### After the last epoch
- `tune_threshold`: sweep the change threshold 0.15 → 0.75 on **val** with TTA, write the winner and
  `tta=true` into `best.pt`.
- `evaluate`: score the test set plain (0.5, no TTA) and tuned, write `weights/final_metrics.json`.

---

## 8. Training runs 1, 2 and 3

### Run 1 — baseline (2026-09-12)
- ResNet-18, 40 epochs, plain BCE, no val split, threshold 0.5.
- Plateaued from ~epoch 35. Epoch 40: **SeK 0.144** (best ~0.147), change IoU 0.467, semantic mIoU
  0.673, change precision 0.79 / **recall 0.53**.
- **Diagnosis:** the change head **under-predicted**. Changed pixels are ~20 % of the data and BCE was
  unweighted. The semantic heads only learn inside changed pixels, so missed change also **starved them**.
- Backed up to `weights/run1_baseline/` (best.pt, last.pt, history.json, final_metrics.json); its index
  kept as `data/analyzed/index_run1.json`.

### Run 2 — never ran
- Only change: BCE `pos_weight ≈ 2.0`. `train_run2.log` stops at epoch 1 iteration 0; the process was
  most likely killed when the session that launched it ended. Its fix was folded into run 3.

### Run 3 — shipped (2026-09-13)
Command (with `PYTHONPATH=src`, launched detached via `Start-Process`, logs `train_run3.log` / `train_run3.err.log`):
```
.venv/Scripts/python.exe -u src/train.py --backbone resnet34 --epochs 80 --batch-size 8 --workers 4
```
- `--smoke` passed before launch. Early losses fell normally (5.88 → 4.47 over the first 100 iterations), stderr empty.
- Launched 00:51, `best.pt`/`last.pt` written 20:34–20:35, `final_metrics.json` 20:37.

| Area | Run 1 | Run 3 |
|---|---|---|
| Backbone | ResNet-18 | ResNet-34 |
| Change loss | plain BCE | BCE (pos_weight ≈ 2) + soft Dice |
| Semantic loss | CE in changed pixels | + consistency loss |
| Model selection | none | separate 223-pair val slice picks best epoch |
| Inference | threshold 0.5 | 4-way flip TTA + val-tuned threshold 0.55 |
| Reporting | history only | `final_metrics.json` (plain + tuned) |
| Safety | — | `--smoke` 1-minute end-to-end check |
| Epochs | 40 | 80 (best at 28) |

### Run 3 training curve (validation)
| Epoch | Train loss | Val SeK | Val change IoU | Val sem mIoU |
|---|---|---|---|---|
| 1 | 4.61 | 0.057 | 0.389 | 0.416 |
| 5 | 2.88 | 0.125 | 0.481 | 0.503 |
| 10 | 2.54 | 0.145 | 0.497 | 0.607 |
| 20 | 2.28 | 0.178 | 0.530 | 0.635 |
| **28** | **2.09** | **0.181 (best)** | **0.531** | **0.637** |
| 40 | 1.77 | 0.167 | 0.515 | 0.661 |
| 60 | 1.29 | 0.163 | 0.505 | 0.690 |
| 80 | 1.18 | 0.156 | 0.500 | 0.666 |

- Val SeK **peaked at epoch 28**, then drifted down while train loss kept falling, which is **overfitting**.
  The shipped checkpoint is epoch 28 (best-by-val-SeK).
- Lesson: **30–35 epochs is enough**. The last ~50 epochs (~11 h of GPU time) added nothing.

### Threshold sweep (validation, with TTA)
| Threshold | 0.15 | 0.25 | 0.35 | 0.45 | 0.50 | **0.55** | 0.60 | 0.65 | 0.75 |
|---|---|---|---|---|---|---|---|---|---|
| Val SeK | 0.139 | 0.164 | 0.178 | 0.187 | 0.190 | **0.191** | 0.189 | 0.185 | 0.174 |

`thresh = 0.55` and `tta = true` are stored in `best.pt`; `analyze.py` and the API read them from there,
so training and serving can't drift apart.

---

## 9. Evaluation: metrics and results

### Metrics (`src/metrics.py`, `SCDMetrics`)
- **SeK (Separated Kappa)**: SECOND's official headline metric. Kappa over the semantic change classes
  with the dominant no-change agreement removed, scaled by change IoU. It is harsh by design:
  **SeK ≈ 0.20 is competitive on SECOND.**
- **Change IoU**: overlap of predicted vs true changed area.
- **Binary mIoU**: mean IoU of changed / unchanged.
- **Change precision / recall / F1.**
- **Semantic mIoU / OA**: land-cover accuracy inside changed regions.
- **Per-class IoU** for each of the 6 classes.

### Run 1 vs run 3 (742 held-out test pairs)
| Metric | Run 1 (baseline) | **Run 3 (shipped, tuned)** | Change |
|---|---|---|---|
| Backbone | ResNet-18 | ResNet-34 | |
| **SeK** | 0.144 | **0.192** | **+33 %** |
| Change IoU | 0.467 | **0.544** | +0.077 |
| Binary mIoU | — | 0.708 | |
| Change precision | 0.79 | 0.74 | −0.05 |
| Change recall | 0.53 | **0.67** | **+0.14** |
| Change F1 | — | 0.705 | |
| Semantic mIoU | 0.673 | **0.676** | |
| Semantic OA | — | 0.837 | |

### Run 3: plain vs tuned (full `weights/final_metrics.json`)
| Metric | Plain (0.5, no TTA) | Tuned (0.55 + TTA) |
|---|---|---|
| SeK | 0.1816 | **0.1922** |
| Change IoU | 0.5362 | 0.5440 |
| Binary mIoU | 0.6997 | 0.7080 |
| Change precision | 0.7019 | 0.7377 |
| Change recall | 0.6942 | 0.6744 |
| Change F1 | 0.6981 | 0.7047 |
| Semantic mIoU | 0.6610 | 0.6758 |
| Semantic OA | 0.8296 | 0.8373 |
| IoU — non-vegetated ground | 0.7224 | 0.7305 |
| IoU — tree | 0.4805 | 0.4865 |
| IoU — low vegetation | 0.6037 | 0.6177 |
| IoU — water | 0.6138 | 0.6426 |
| IoU — buildings | 0.8425 | **0.8509** |
| IoU — playgrounds | 0.7034 | 0.7265 |

- Even without tuning, run 3 (0.182) is far above the baseline (0.144).
- Tuning raised precision (0.70 → 0.74) at a small recall cost, in line with the brief's "favour
  precision over indiscriminate recall".
- Buildings are easiest (sharp edges, distinctive texture). **Tree vs low vegetation** is the hardest
  confusion (similar colour from above).

---

## 10. Offline analysis and the per-pair record

`src/analyze.py` runs the model once over all 742 test pairs (**4 min 44 s, 2.61 pairs/s** for run 3 on the
RTX 4060) and writes one JSON record + one overlay PNG per pair, then `index.json`.

Options: `--source {model,gt}`, `--split test`, `--checkpoint weights/best.pt`, `--batch-size 8`, `--limit N`.

### Record fields (`build_record`)
| Field | Meaning |
|---|---|
| `pair_id`, `source` | id; `"model"` or `"ground_truth"` |
| `image1`, `image2`, `overlay` | URLs served by the API |
| `changed_px`, `changed_pct_of_frame` | size of the changed region |
| `same_category_px` | changed pixels whose class stayed the same (appearance change) |
| `transition_matrix` | 6 × 6 before-class × after-class pixel counts (`transition_matrix()`) |
| `transition_vec` | the matrix flattened, divided by `changed_px` (36-dim, L1-normalised) for similarity |
| `per_category` | per class: px/pct before & after, `delta_pp`, `relative_pct`, `direction` (`per_category()`) |
| `top_transitions` | largest "from → to" flows with px and % of frame (`top_transitions()`) |
| `metadata` | synthetic region, lat/lon, dates, sensor, `synthetic: true` |
| `description` | one-paragraph plain-English summary, made with an f-string (`describe()`), no LLM |

Example (pair `00003`, model): 44.0 % of the frame changed (115,341 px); tree fell from 35.57 % to
0.01 % of the changed area (−100 %) while non-vegetated ground rose 31.46 % → 41.38 %.

### Overlays (`src/overlay.py`)
- A baked **512 × 512 PNG**: the "after" image in greyscale for context, predicted classes painted in
  their colours on changed pixels, and a legend of the classes present (`_draw_legend`). The browser just
  shows an `<img>`. 1,484 overlay files exist (model + GT).

### Ground-truth index
- `analyze.py --source gt` builds the same records from the true labels into `index_gt.json`, tagged
  `"source": "ground_truth"`. This powers the **Model / Ground-Truth toggle**.

### Synthetic metadata (`src/metadata.py`)
- SECOND has no coordinates or dates, so they are generated **deterministically** from an md5 hash of
  the pair id (not Python's salted `hash()`), which keeps them stable across restarts.
- City = one of the three real capture cities (bounding boxes: Hangzhou 30.15–30.40 N / 120.05–120.30 E,
  Chengdu 30.55–30.75 N / 103.95–104.20 E, Shanghai 31.10–31.35 N / 121.35–121.60 E). The exact point
  inside the box is invented.
- "Before" date 2014–2017, "after" date 2019–2022.
- Only **generic sensor names** (e.g. "Aerial survey (RGB orthophoto)"), never a real satellite.
- Every record carries `"synthetic": true`, and the UI shows a **SYNTHETIC** badge.
- Uploaded pairs get **no** invented metadata: `synthetic: false, uploaded: true` + native sizes.

### What the model index shows (742 tiles)
- Changed area per tile: **mean 18.0 %**, median 14.2 %, min 0.1 %, max 70.5 %.

| Level | Rule | Tiles |
|---|---|---|
| Severe | ≥ 40 % | 63 (8.5 %) |
| High | 25–40 % | 123 (16.6 %) |
| Moderate | 10–25 % | 295 (39.8 %) |
| Low | < 10 % | 261 (35.2 %) |

- Region split (synthetic): Hangzhou 258 · Chengdu 249 · Shanghai 235.
- Dominant transitions (share of pixels among each tile's top transitions): bare ground → buildings
  **29.0 %**, low vegetation → buildings **17.3 %**, low vegetation → bare ground 11.3 %, bare ground → low
  vegetation 10.5 %, buildings → bare ground 8.8 %, bare ground → tree 5.9 %.
- The main signal is **urbanisation**: land being cleared and built on.

---

## 11. Natural-language search

### Parser (`src/parser.py`): rule-based on purpose
Regex + keyword rules only, **no ML, no LLM**. Output is a `Filter` object. The parsed filter is echoed
back ("Interpreted as …"), so every result can be explained.

| # | Example query | Parsed as |
|---|---|---|
| 1 | `vegetation decreased` | categories tree + low vegetation, direction decrease |
| 2 | `where buildings increased` | category buildings, direction increase |
| 3 | `tree loss over 10%` | + threshold ≥ 10 percentage points |
| 4 | `trees became buildings` | transition tree → buildings |
| 5 | `vegetation converted to bare ground` | transition {tree, low veg} → ground |
| 6 | `changes in Chengdu` | region filter |
| 7 | `within 20 km of 30.28, 120.15` | centre + radius (haversine) |
| 8 | `between 2015 and 2018` | date range |
| 9 | `most changed areas` | sort by total change |
| 10 | `deforestation`, `urbanization` | named transition aliases |

Vocabulary (`classes.py`):
- Synonyms: "forest / canopy / woodland" → tree; "farmland / cropland / grass" → low vegetation;
  "lake / river / pond" → water; "urban / houses / construction" → buildings; "bare soil / cleared land" → ground.
- Groups: "vegetation / greenery / green cover" → {tree, low veg}; "land" → {ground, tree, low veg}.
- Named transitions: deforestation, urbanization / urban sprawl / construction, reforestation /
  afforestation, greening, land clearing, flooding.
- ~20 increase words and ~25 decrease words; "top 5 / show me 5" sets the limit; "unchanged / stable"
  sorts ascending.
- Longest match first, so "bare ground" beats "ground" and "low vegetation" beats "vegetation".

Example chips on the query page (`/api/examples`): "where did trees become buildings", "vegetation decreased",
"urbanization in Shanghai", "tree loss over 10%", "changes in Chengdu", "most changed areas".

### Search (`src/search.py`): no inference, milliseconds
- **Filter** (`matches`): region, radius (`haversine_km`), dates, transition pixels > 0, sign of the
  category delta, threshold.
- **Rank** (`relevance`, `_sort`): transition pixels for transition queries, |Δ category| for category
  queries, total changed % otherwise.
- **Fallback ladder** (`_relaxations`, `run_query`): if nothing matches, relax one constraint at a time
  and say so:
  1. drop the size threshold → 2. drop the date range → 3. drop region / radius →
  4. exact transition → any change involving those categories → 5. drop the direction →
  6. last resort: most-changed tiles.
  The response is marked `relaxed: true` with a readable note. "No exact match, here's the closest"
  looks deliberate; an empty screen looks broken.
- **Similar tiles** (`SimilarityIndex`): cosine similarity over the 36-dim transition vectors, top-k,
  excluding the tile itself. Used on the tile page and after an upload.

---

## 12. Backend API (FastAPI, `src/api.py`)

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/health` | `{status, model_loaded, n_records, index_source, device}` |
| GET | `/api/pairs?limit&offset&sort` | gallery cards (default 60, sorted by changed %) |
| GET | `/api/pairs/{id}?source=gt` | full record, model or ground truth |
| GET | `/api/pairs/{id}/similar?k=6` | most similar tiles |
| POST | `/api/query` `{text, limit}` | `parsed_filter, parsed_summary, results, relaxed, note` |
| GET | `/api/examples` | example query chips |
| GET | `/api/stats` | index-wide 6×6 transition matrix + one point per tile (region, lat/lon, %) for the overview |
| POST | `/api/analyze` (`before`, `after` files) | live analysis → `record, similar[], ood_warning, ood_note` |
| GET | `/media/*`, `/media/second/*`, `/uploads/*` | overlays, dataset images, uploads |
| GET | `/` | the built React UI (`frontend/dist`) |

How it works:
- Index loaded into RAM at startup (`load_index`); falls back to `index_gt.json` if `index.json` is missing.
  Restart the API after re-running `analyze.py`.
- **Model loaded lazily** on the first `/api/analyze` (`get_model`), so search works without a checkpoint or GPU.
- `/api/stats` rebuilds the exact index-wide transition matrix from `transition_vec × changed_px`.
- `/api/analyze`: reads both uploads, resizes to 512×512 if needed, saves them under `uploads/<uid>/`,
  runs `model.predict` with the checkpoint's threshold/TTA under bf16, bakes the overlay, calls the same
  `build_record()` as the offline pipeline, and finds the 5 most similar indexed tiles.
  ~**3.6 s on CUDA**; for a dataset pair it matches the precomputed record.
- **Out-of-distribution guard:** images that are not 512×512 are resampled and flagged with
  `ood_warning` + an explanatory note in the UI.
- Static mount detail: `data/second` is a junction, and StaticFiles refuses paths that resolve outside
  its root, so the dataset is mounted at its **real path** under `/media/second`, before `/media`.

---

## 13. Frontend: the command console

React 19 + Vite 8, **no extra UI or chart libraries** (charts are hand-drawn SVG), hash routing,
oxlint for linting. ~2,300 lines of JSX/JS + 556 lines of CSS (`theme.css`).

| View | Route | File | What it shows |
|---|---|---|---|
| **Situation overview** | `#/` | `Overview.jsx` | KPIs, activity breakdown, sector plot, change-level histogram, watchlist of most-changed tiles |
| **Query** | `#/search?q=` | `Search.jsx` | search box, example chips, "Interpreted as" filter tokens, query history, ranked results, relaxation notes |
| **Tile explorer** | `#/explore` | `Explorer.jsx` | filterable, pageable gallery of all 742 tiles |
| **Tile assessment** | `#/pair/{id}[?src=gt]` | `Dossier.jsx` | before/after viewer, transition matrix, per-category table, model-vs-GT summary, similar tiles, printable brief |
| **Analyze imagery** | `#/analyze` | `Analyze.jsx` | drag-and-drop two images → live analysis + 5 most similar indexed changes |

Components:
- `Shell.jsx`: sidebar + top bar. `ui.jsx`: badges, cards, tables. `charts.jsx`: SVG charts.
  `Compare.jsx`: **swipe, flicker and side-by-side** modes + **magnifier**. `Assessment.jsx`: the tile report
  shared by the dossier and upload views. `Tip.jsx`, `Icons.jsx`.
- `lib/constants.js`: classes/colours (mirroring `classes.py` so swatches match the overlays), city boxes,
  change levels, activity groups, formatters. `lib/hooks.js`: fetch hook, hash router, navigation list.

Concepts shown to the user:
- **Change levels:** Severe ≥ 40 %, High ≥ 25 %, Moderate ≥ 10 %, Low.
- **Activities:** the 30 off-diagonal transitions grouped for a commander, first match wins:
  New construction (→ buildings) · Structure removal (buildings →) · Vegetation clearing (veg → ground) ·
  Water body change · Vegetation regrowth (ground → veg) · Vegetation type shift (tree ↔ low veg) ·
  Other surface change. Each group links to a ready-made query.
- **Model / Ground-Truth toggle** on every tile; SYNTHETIC and source badges; every percentage table
  shows its denominator (`changed_px`, `changed_pct_of_frame`).

API address: `VITE_API` if set → `http://localhost:8000` in dev → `""` (same origin) in a production build,
so the built UI works on whatever port the API serves it from.

---

## 14. Environment, setup and the one-command launcher

### Environment
- **Python 3.11** venv (`.venv`) created with `--system-site-packages` so it reuses the working CUDA stack of
  the base 3.11 install. Only `opencv-python` and `tqdm` were installed into the venv itself.
- Pinned in `requirements.txt` (with the `cu121` PyTorch index): torch 2.5.1+cu121, torchvision 0.20.1+cu121,
  torchaudio 2.5.1+cu121, fastapi 0.141.1, uvicorn 0.52.4, numpy 2.4.6, pillow 12.3.0, opencv-python 5.0,
  scikit-learn 1.9.0, tqdm, python-multipart, pydantic 2.13.
- **Warning:** `python` on PATH is **3.14** with CPU-only torch. Always use `.venv/Scripts/python.exe` or `py -3.11`.
- Node.js 18+ (launcher asks for 20+).

### One command (`start.bat` or `powershell -ExecutionPolicy Bypass -File start.ps1`)
Every step is skipped if already done, so it is safe to run again:
1. Create `.venv` with Python 3.11 (fails clearly if `py` or 3.11 is missing); install requirements if any
   import fails (first run downloads ~2.5 GB CUDA torch); report whether CUDA is available.
2. Check `data\second`; write the split **only if missing**; warn if `weights\best.pt` is missing
   (search then runs on ground truth, upload is disabled). **Never trains.**
3. Build `index_gt.json` / `index.json` only if missing.
4. `npm install` (first time) + `npm run build`.
5. Refuse to start if the port is already listening (shows the PID, never kills it), start uvicorn on
   127.0.0.1, wait up to 60 s for `/api/health`, open the browser, Ctrl+C stops everything.

Options: `-Dev` (hot-reload UI on :5173 with API on :8000), `-Port N`, `-NoBrowser`.

### Manual
```bash
py -3.11 -m venv .venv --system-site-packages
./.venv/Scripts/python.exe -m pip install -r requirements.txt
cmd /c mklink /J "data\second" "C:\dataa\second"

cd frontend && npm install && npm run build && cd ..
./.venv/Scripts/python.exe -m uvicorn api:app --app-dir src --port 8000   # open http://localhost:8000
```

### Rebuild from scratch
```bash
./.venv/Scripts/python.exe src/make_split.py                                  # once only
PYTHONPATH=src ./.venv/Scripts/python.exe src/train.py --backbone resnet34 --epochs 35 --batch-size 8 --workers 4
PYTHONPATH=src ./.venv/Scripts/python.exe src/analyze.py                      # model -> index.json
PYTHONPATH=src ./.venv/Scripts/python.exe src/analyze.py --source gt          # truth -> index_gt.json
cd frontend && npm run dev                                                    # UI dev on :5173
```

Other setup files: `setup.txt` (step-by-step manual guide, step 0 = launcher), `.claude/commands/run.md`
(a `/run` command that builds the UI and starts the API without retraining or touching running processes).

---

## 15. Testing and verification done

| Check | How | Result |
|---|---|---|
| Training pipeline | `train.py --smoke` (~1 min, into `weights/smoke/`) before run 3 | passed |
| Early training health | first 100 iterations of run 3 | total loss 5.88 → 4.47, stderr empty |
| Model selection | best-by-val-SeK + threshold sweep on val only | epoch 28, thresh 0.55 |
| Final scores | `final_metrics.json` on 742 unseen test pairs, plain and tuned | SeK 0.182 / 0.192 |
| Label sanity | `dataset.py` assertion that label1/label2 agree on changed pixels | holds for every sample |
| Index build | `analyze.py` over 742 pairs, both sources | 742 records each, stats printed |
| End-to-end (run 3 API) | overview, query, explorer, tile assessment, GT toggle, similar tiles, `/api/analyze` upload | all working |
| Upload consistency | uploaded a dataset pair via `/api/analyze` | ~3.6 s on CUDA, record matches the index |
| Frontend build | `npm run build` | passes; oxlint only warnings |
| Visual check | headless Edge screenshots of each view against the live API | rendered correctly |
| Launcher | `start.ps1` idempotent steps, port-in-use refusal, health-check wait | documented in `setup.txt` |

Not yet done: clicking through the upload drop zones in a real (non-headless) browser; no automated unit
test suite in the current version (the earlier Phase 1 scaffold had pytest files).

---

## 16. Problems we hit and how we fixed them

| Problem | Cause | Fix |
|---|---|---|
| First architecture could not be evaluated | untrained adapters, unverified Prithvi weights, no labels | restarted on SECOND, a labelled dataset with an official metric |
| 7-class head would learn "no-change" everywhere | ~80 % of pixels are no-change | 6-class semantic heads + separate binary change head |
| Water / playgrounds never predicted | 1.2 % / 0.6 % of changed pixels | inverse-sqrt class weights, cached |
| Run 1 recall only 0.53, SeK stuck at 0.144 | unweighted BCE on a 20 %-positive target also starved semantic heads | pos_weight + Dice, consistency loss, ResNet-34 |
| Run 2 died at epoch 1 | process killed with the session that launched it | run 3 launched fully detached via `Start-Process` with log files |
| Risk of an 18 h run crashing at the end | untested final threshold/report code | `--smoke` end-to-end run first |
| Overfitting after epoch 28 | 80 epochs was too many | best-by-val checkpoint; recommend 30–35 epochs |
| Threshold tuned on test would be cheating | — | val slice carved from train; threshold + TTA stored in checkpoint |
| Slow training (~3 s/iter) | suspected Windows dataloader bottleneck (unconfirmed) | accepted for this run; listed as future work |
| `python` is 3.14 with CPU-only torch | two Python installs on PATH | always use venv / `py -3.11`; launcher checks it |
| Dataset images 404 through the API | StaticFiles refuses a junction resolving outside its root | mount `data/second` at its real path before `/media` |
| Built UI broke on ports other than 8000 | hard-coded API URL | `VITE_API` → dev :8000 → same-origin `""` |
| Stale API with the run 1 index on :8000 | old session's server could not be stopped | new API on :8001; launcher refuses busy ports instead of killing them |
| ResNet-34 ImageNet weights too big to commit | 87 MB file | one-line recreate command in README |
| Browser automation extension not connected | — | headless Edge screenshots for visual checks |
| Progress-bar logs unreadable | `\r` tqdm bars | `tr '\r' '\n' \| grep -v '%\|'` |
| No real metadata in SECOND | dataset limitation | deterministic synthetic metadata, clearly badged |

---

## 17. Presentation slide outline

Each slide points to the part of this file with the full content and tables.

| # | Slide | Key points | Source |
|---|---|---|---|
| 1 | **Title** — Change Lens: semantic change detection with a natural-language query console | where + what changed; plain-English search; stack | Part 1 |
| 2 | **The problem** | eye comparison doesn't scale; binary change isn't enough; results must be searchable & explainable; commander user | Part 2 |
| 3 | **Solution in one picture** | diagram below | Parts 6, 10, 11 |
| 4 | **Dataset: SECOND** | 2,968 pairs, 7 classes, labels only in changed regions, 80 % no-change | Part 4 |
| 5 | **Data split** | 2,003 fit / 223 val / 742 test = index | Part 5 |
| 6 | **Model architecture** | Siamese ResNet-34 U-Net, `|f1−f2|` + `f1·f2` change head | Part 6 |
| 7 | **Six classes, not seven** | 80 % trap, supervised only on changed pixels, class weights | Part 6 |
| 8 | **Training setup & augmentation** | AdamW, cosine, bf16, temporal swap, jitter | Part 7 |
| 9 | **Loss function** | CE + BCE(pos_weight)+Dice + consistency | Part 7 |
| 10 | **Inference tricks** | 4-way TTA, threshold sweep table | Part 8 |
| 11 | **Metrics explained** | SeK, change IoU, P/R/F1, sem mIoU | Part 9 |
| 12 | **Results: run 1 vs run 3** | SeK 0.144 → 0.192 (+33 %), recall 0.53 → 0.67 | Part 9 |
| 13 | **Per-class IoU** | buildings 0.85 … tree 0.49 | Part 9 |
| 14 | **What went wrong in run 1 and the fixes** | under-prediction diagnosis, run 2, run 3 table | Part 8 |
| 15 | **Training curve & overfitting** | peak at epoch 28 | Part 8 |
| 16 | **Offline analysis: the per-pair record** | transition matrix, per-category, overlay, GT index | Part 10 |
| 17 | **What the index shows** | 18 % mean change, level table, urbanisation story | Part 10 |
| 18 | **Honesty guarantees** | unseen data, synthetic metadata badged, GT tagged, denominators | Parts 10, 19 |
| 19 | **Rule-based parser** | 10 patterns, synonyms, echoed filter | Part 11 |
| 20 | **Search, ranking, fallback ladder, similarity** | 6-step ladder, cosine over transition vectors | Part 11 |
| 21 | **Backend API** | endpoint table, lazy model, OOD guard, serves UI | Part 12 |
| 22 | **Frontend command console** | 5 views, compare viewer, activities, levels | Part 13 |
| 23 | **Live demo walkthrough** | steps below | Part 13 |
| 24 | **How to run it** | one command + manual | Part 14 |
| 25 | **Project journey** | foundation-model scaffold → reset → SECOND → run 1 → run 3 → ship | Parts 3, 22 |
| 26 | **Problems & fixes** | pick 5–6 rows | Part 16 |
| 27 | **Coverage of the brief** | capability table | Part 18 |
| 28 | **Key engineering decisions** | 10 decisions | Part 19 |
| 29 | **Limitations** | | Part 20 |
| 30 | **Future work** | | Part 20 |
| 31 | **Conclusion** | end-to-end SCD system, +33 % SeK, honest by construction | Part 1 |

**Slide 3 diagram:**
```
 before image ─┐                        ┌─> semantic map (before)  ─┐
               ├─> Siamese ResNet-34 ──>├─> semantic map (after)   ─┼─> per-pair record (JSON)
 after image  ─┘      U-Net             └─> binary change mask     ─┘   + baked overlay PNG
                                                                           │
                                                   742 records ──> in-memory index
                                                                           │
   "trees became buildings" ──> rule-based parser ──> filter ──> search/rank ──> React console
```
Three parts: (1) **model**, (2) **offline analysis** (every test pair run once), (3) **search console**
(zero inference at query time), plus a live **upload-and-analyze** path.

**Slide 23 demo order:**
1. Situation overview: KPIs, activity mix, watchlist of Severe tiles.
2. Query: click an example chip ("trees became buildings"), point at *Interpreted as*.
3. Query with no exact match → show the **relaxed** note.
4. Open a result → swipe / flicker the viewer, use the magnifier.
5. Toggle Model ↔ Ground truth to show how close the model is.
6. Similar tiles; print the brief.
7. Analyze imagery: upload a pair from `data/second/im1` + `im2`, live result in ~4 s.

**Conclusion slide:**
- Built an end-to-end semantic change detection system: model → precomputed analysis → explainable
  natural-language search → commander-style console.
- Raised test SeK from 0.144 to 0.192 (+33 %) and change recall from 0.53 to 0.67 by fixing class
  imbalance, adding a consistency loss, using a deeper encoder, and tuning inference on validation.
- Honest by construction: unseen test data, synthetic metadata labelled, GT vs model always badged.

---

## 18. How the system maps to the brief (coverage and gaps)

| Brief item | What Change Lens does | Gap |
|---|---|---|
| 2.2.1 Semantic retrieval | Free-text queries via rule-based parser; ranked results; region / radius / date filters; "similar tiles" | Similarity is over change-transition vectors, not visual image embeddings; free text limited to supported patterns |
| 2.2.2 Change analysis | Pixel-level change + from→to class for 6 classes; activity types (construction, removal, clearing, water, regrowth) | Two dates only, so no "earliest observation"; no roads class in SECOND |
| 2.2.3 False-alarm suppression | Consistency loss on unchanged pixels, per-image brightness/contrast jitter, TTA, threshold tuned toward precision, OOD warning | No cloud / snow / shadow quality masks; no per-pixel confidence shown |
| 2.2.4 Discovery & clustering | Cosine "similar tiles" from any tile or upload | No unsupervised clustering over a wide area |
| 2.2.5 Workflow & provenance | Ranked queue, before/after viewer, location/date/sensor (synthetic, badged), source badge, printable brief | No confirm/reject decisions, audit trail or exports |
| 2.2.6 Scale / ingestion / sovereignty | In-memory JSON index (~2 MB for 742 tiles), live upload analysis, fully on-prem | Uploads are not added to the index; no GeoTIFF / COG; no vector database |
| 2.2.7 Offline | Local ImageNet weights, no LLM or external API, pinned requirements | — |
| 2.3 Evaluation report facts | Indexed tiles 742; index build 4 min 44 s; storage ~297 MB analysed data (index 1.97 MB); query latency milliseconds (in-memory pass, not formally benchmarked); hardware RTX 4060 8 GB laptop | Real indexed area unknown (SECOND has no coordinates) |

---

## 19. Key engineering decisions

1. **6-class semantic heads + separate binary change head**, avoiding the 80 % no-change trap.
2. **Test set = search index**, so every result shown is on unseen data. Split never regenerated.
3. **Search does zero inference**: precompute once, query in milliseconds.
4. **Rule-based parser**: deterministic and explainable; the filter is echoed back.
5. **Fallback ladder**: never an empty screen; always says what was relaxed.
6. **Threshold + TTA tuned on validation and stored in the checkpoint.**
7. **Synthetic metadata clearly labelled**; GT always tagged as GT; percentages state their denominator.
8. **Overlays baked server-side**: the browser only shows PNGs.
9. **Offline-capable**: pretrained weights from disk, no network needed.
10. **Single-process demo**: the API serves the built UI; the launcher never trains and never kills processes.
11. **Shared code for training and serving** (`classes.py`, `model.py`, `build_record()`), so class order,
    architecture and record format can't drift.

---

## 20. Limitations and future work

### Limitations
- **Metadata is synthetic**: location/date/radius queries show the capability but are not real provenance.
- **Tree vs low vegetation** remains the weakest distinction (tree IoU 0.49).
- Trained only on SECOND (3 Chinese cities, aerial RGB, 512×512); other sensors or resolutions are
  out of distribution (flagged on upload).
- Parser covers 10 patterns plus synonyms; other phrasing falls back to keyword matching / relaxation.
- Only two timestamps per location; no time series.
- No analyst feedback loop, audit trail or export yet.
- Training was slow (~3 s/iter), probably a Windows dataloader bottleneck (unconfirmed).
- Run 3 trained 80 epochs when ~30 would have been enough.

### Future work
- Train 30–35 epochs with early stopping; profile and fix the dataloader bottleneck.
- Stronger backbones / attention-based change fusion to push SeK past 0.20.
- Real geo-referenced imagery (GeoTIFF / COG) with true dates and coordinates.
- Tiling for large scenes instead of resampling uploads to 512×512.
- Add uploads to the index incrementally; confirm/reject review with audit trail and GeoJSON export.
- Visual embeddings (e.g. a remote-sensing CLIP) for image-to-image search and clustering.
- Optional LLM-assisted query parsing that still outputs a structured, echoed filter.
- Cloud/shadow quality masks and per-pixel confidence.
- Alerts: saved queries that flag new Severe changes automatically.

---

## 21. Files, artefacts, sizes and timings

### Code layout (current version, ~5,200 lines)
```
src/                      (Python, 2,100 lines; flat imports, run with --app-dir src / PYTHONPATH=src)
  classes.py      138     7-class palette, RGB↔index LUT, query vocabulary
  dataset.py      135     SecondDataset, read_ids (fit/val carve), load_pair, normalize, jitter
  model.py        171     Encoder, Decoder, SCDNet, build_model, load_checkpoint, TTA predict
  metrics.py      145     SCDMetrics: binary mIoU, SeK, per-class IoU
  train.py        338     class weights, scheduler, dice/consistency losses, evaluate, tune_threshold
  make_split.py    52     one-time train/test split
  analyze.py      238     transition matrix, per_category, top_transitions, describe, build_record
  overlay.py       82     baked overlay PNG + legend
  metadata.py      70     deterministic synthetic geo/date/sensor
  parser.py       220     Filter + rule-based parse()
  search.py       204     matches, relevance, relaxations, run_query, SimilarityIndex
  api.py          289     FastAPI app + static mounts
frontend/src/             (React, ~2,500 lines JSX/JS + 556 CSS)
  App.jsx, main.jsx, theme.css
  lib/            constants.js, hooks.js
  components/     Shell, ui, charts, Compare, Assessment, Tip, Icons
  views/          Overview, Search, Explorer, Dossier, Analyze
start.ps1, start.bat      one-command launcher
setup.txt, README.md, CLAUDE.md, ppt.md, requirements.txt, .claude/commands/run.md
```

### Data and weights
| Path | Content | Size |
|---|---|---|
| `data/second` | junction → `C:\dataa\second` (SECOND dataset) | outside repo |
| `data/splits/train.txt`, `test.txt` | 2,226 / 742 ids | small |
| `data/class_weights.json` | pixel counts per class | small |
| `data/analyzed/` | 742 model + 742 GT records, 1,484 overlays, indexes | ~297 MB |
| `data/analyzed/index.json` | run 3 model index | 1.97 MB |
| `data/analyzed/index_gt.json` | ground-truth index | 1.91 MB |
| `data/analyzed/index_run1.json` | run 1 index (kept) | 1.95 MB |
| `weights/best.pt` / `last.pt` | run 3 (epoch 28 / 80), with thresh + tta | 295 MB each |
| `weights/history.json`, `final_metrics.json` | per-epoch history, test scores (committed as evidence) | 29 KB / 2 KB |
| `weights/resnet18_imagenet.pt` | local ImageNet init (committed) | 47 MB |
| `weights/resnet34_imagenet.pt` | local ImageNet init (recreate, not committed) | 87 MB |
| `weights/run1_baseline/` | run 1 best/last/history/metrics | 174 MB × 2 |
| `uploads/` | pairs analysed via `/api/analyze` | ~7 MB |
| `frontend/dist` | built UI | 321 KB |

### Logs
`train.log` (run 1), `train_run2.log` (run 2, died), `train_run3.log` / `train_run3.err.log` (run 3),
`train2.log`, `train3.log`, `analyze_model.log`, `analyze_gt.log`, `analyze_run3.log`, `api.log`,
`api_dev.log`, `api_run3.log`, `frontend.log`.

### Timings
| Task | Time |
|---|---|
| Run 3 training (80 epochs) | ~18 h (~13–14 min/epoch) |
| Smoke test | ~1 min |
| Index build (742 pairs, model) | 4 min 44 s (2.61 pairs/s) |
| Live upload analysis | ~3.6 s on CUDA |
| Query | milliseconds (in-memory pass) |
| First venv install | ~2.5 GB download (CUDA torch) |

---

## 22. Git timeline

| Commit | Date | Milestone |
|---|---|---|
| `cab892e` … `4010a3d` | 2026-09-05 | repo created; project description and brief added to README |
| `ca1f2fc` | 2026-09-07 | early changes |
| `c2bf2b1` | 2026-09-07 | first design: foundation-model archive search scaffold (ingestion, RemoteCLIP/Prithvi, LanceDB, SQLite, Celery, Docker, React UI, tests) |
| `68589e6` | 2026-09-07 | frontend lockfile, ignore generated files |
| `787933a` | 2026-09-07 | fix Windows ingestion environment setup |
| `7582712` | 2026-09-07 | allow API startup without eager model loading |
| `f0ff00d` | 2026-09-11 | stray tic-tac-toe commit |
| `ed908a1`, `cd73456` | 2026-09-11 | repository contents removed (reset) |
| `9763831`, `090728f`, `b98c201` | 2026-09-12 | Change Lens rebuilt on SECOND: dataset, model, training, analysis, parser, search, API, UI |
| run 1 | ≤ 2026-09-12 | ResNet-18, 40 epochs → test SeK 0.144; first indexes |
| run 2 | 2026-09-13 | pos_weight only; died at epoch 1 |
| `0476656` | 2026-09-13 | model improvements (ResNet-34, Dice, consistency, val split, TTA/threshold) + command-console UI |
| run 3 | 2026-09-13 00:51 → ~20:35 | 80 epochs; best epoch 28; tuned test SeK 0.192 |
| `1f6082b` | 2026-09-13 | ship run 3: index rebuilt, same-origin API, README, requirements, .gitignore |
| `b15fa4e`, `dadd719` | 2026-09-13 | documentation of status and run 1 → run 3 changes |
| (uncommitted) | 2026-09-14 | `start.bat` / `start.ps1` launcher, `setup.txt` step 0, `.claude/commands/run.md`, this dossier |
