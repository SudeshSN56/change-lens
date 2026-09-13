# Change Lens — project notes for Claude

Semantic change detection on the SECOND aerial dataset, plus a natural-language
search UI over the results. Python/PyTorch model + FastAPI backend + React/Vite frontend.

**Keep this file updated.** When a run finishes, a decision is made, or a task moves,
edit the status sections below so the next session picks up where this one left off.

---

## 1. Layout

```
src/                 model + pipeline (all imports are flat: `--app-dir src`)
  classes.py         canonical 7-class list (0 = no-change, 1..6 land cover). Single source of truth.
  dataset.py         SecondDataset -> (im1, im2, y1, y2, change_mask), 512x512, ImageNet-normalised
  model.py           Siamese ResNet-18 U-Net: 2 semantic heads (6 classes) + 1 change head
  metrics.py         SCDMetrics: binary mIoU, SeK, per-class IoU
  train.py           training loop -> weights/best.pt, weights/last.pt, weights/history.json
  make_split.py      writes data/splits/{train,test}.txt ONCE — never regenerate
  analyze.py         precompute per-pair records + overlays -> data/analyzed/
  overlay.py         bakes one 512x512 PNG per pair (greyscale context + class colours + legend)
  metadata.py        deterministic SYNTHETIC city/date/sensor metadata (md5-seeded, flagged `synthetic: true`)
  parser.py          rule-based NL query parser (regex/keywords only, 10 supported patterns)
  search.py          filter/rank/similarity over the in-memory index + relaxation fallback ladder
  api.py             FastAPI: /api/health /api/pairs /api/pairs/{id} /api/pairs/{id}/similar
                     /api/query /api/examples /api/stats /api/analyze
frontend/            React 19 + Vite 8, no extra deps. "Command console" UI, hash routing.
  src/App.jsx        routes: #/ overview, #/search?q=, #/explore, #/analyze, #/pair/{id}[?src=gt]
  src/lib/           constants.js (classes, change LEVELS, ACTIVITIES grouping), hooks.js (fetch, router, nav list)
  src/components/    Shell (sidebar/topbar), ui (badges, cards, tables), charts (hand-rolled SVG),
                     Compare (swipe/flicker/side-by-side + magnifier), Assessment (shared tile report)
  src/views/         Overview, Search, Explorer, Dossier (tile assessment), Analyze (upload)
data/second          symlink -> /c/dataa/second (im1, im2, label1, label2)
data/splits/         train.txt (2226 pairs), test.txt (742 pairs)
data/analyzed/       per-pair {id}.json / {id}_gt.json + overlays/ + index.json / index_gt.json
weights/             best.pt, last.pt, history.json, resnet18_imagenet.pt (local ImageNet init)
uploads/             user-uploaded pairs from /api/analyze (currently empty)
```

## 2. Environment / commands

Python 3.11 in `.venv`, created with `--system-site-packages` so it inherits the
already-working CUDA stack from the base 3.11 install (torch 2.5.1+cu121, torchvision
0.20.1+cu121, numpy, pillow, fastapi, uvicorn, sklearn, python-multipart). Only
`opencv-python` and `tqdm` were installed into the venv itself. Pinned in `requirements.txt`.

Note: `python` on PATH is **3.14**, which has a CPU-only torch. Always use the venv
interpreter or `py -3.11`, never bare `python`.

```bash
PYTHONPATH=src .venv/Scripts/python.exe src/train.py --epochs 40 --batch-size 8 --workers 4
.venv/Scripts/python.exe src/analyze.py                # model predictions -> index.json
.venv/Scripts/python.exe src/analyze.py --source gt    # ground truth      -> index_gt.json
.venv/Scripts/python.exe -m uvicorn api:app --app-dir src --port 8000
cd frontend && npm run dev                             # expects API at http://localhost:8000 (VITE_API to override)
```

## 3. Key design decisions (do not undo without reason)

- **Semantic heads predict 6 classes, not 7.** No-change is ~79% of pixels and identical in
  both label maps; a 7-class head would collapse to "no-change" and score ~79% while being
  useless. The binary change head owns that question; semantic heads are supervised only
  inside changed regions.
- **The 742 test pairs are both the eval set and the searchable index.** Nothing the UI returns
  was trained on. `data/splits/test.txt` on disk is the proof — never regenerate the split.
- **Search does zero inference.** Queries are a pass over the precomputed in-memory index.
- **Parser is rule-based on purpose** — the parsed filter is echoed back, so every result is explainable.
- **Metadata is synthetic and labelled as such.** SECOND ships no geolocation/dates; every record
  carries `"synthetic": true`. Only generic sensor names — never claim a real satellite.
- **GT records are tagged `"source": "ground_truth"`** — GT is never passed off as model output.
- **Overlays are baked server-side into flat PNGs** so the browser only has to `<img src>` them.

## 4. Status — done

- Dataset wiring, class definitions, splits (2226 train / 742 test), class-weight cache.
- Model, metrics (SeK), training loop with best/last checkpointing and per-epoch history.
- Full analysis pipeline: per-pair records, overlays, index build.
- Rule-based query parser (10 patterns), search with relaxation fallback, similarity ranking.
- **Run 3 finished (2026-09-13) and is the kept model.** best.pt = epoch 28 (val SeK peaked
  there at 0.181, then slowly fell to 0.156 by epoch 80 as train loss kept dropping: overfitting;
  next time 30–35 epochs is enough). Test, tuned (thresh 0.55 + flip TTA): SeK **0.192**, change
  IoU 0.544, sem mIoU 0.676, P 0.74 / R 0.67. Plain (0.5, no TTA): SeK 0.182. Run 1 was 0.144.
  `index.json` rebuilt from it (742 records; run 1 index kept as `index_run1.json`).
  What changed before that training run is listed in §4a below.
- End-to-end check passed on the run 3 API: overview, query, explorer, tile assessment,
  GT toggle, similar tiles, and `/api/analyze` upload (~3.6 s on CUDA, matches the index record).
- Production builds now call the API same-origin (`constants.js`: `VITE_API` → dev :8000 → `""`),
  so the built UI works on whatever port the API serves it from.
- FastAPI backend with all endpoints incl. upload-and-analyze.
- React frontend: query view with example chips, gallery with paging, upload drop zones,
  detail view with a Model / Ground-Truth toggle.

## 4a. Changes made before the long run 3 training (run 1 → run 3)

Why: run 1 (ResNet-18, 40 epochs) plateaued at test SeK 0.144. The change head under-predicted
(recall 0.53) because changed pixels are only ~20% of the data and BCE was unweighted; that also
starved the semantic heads, which only learn inside changed regions. Run 2 (pos_weight only) never
ran, so all fixes went into run 3. Code landed in commit 0476656 (`model.py`, `train.py`,
`dataset.py`, `metrics.py`, `analyze.py`, `api.py`).

| Area | Run 1 | Run 3 | Where |
|---|---|---|---|
| Backbone | ResNet-18 | ResNet-34 (`--backbone`), local ImageNet weights `weights/resnet34_imagenet.pt`; backbone saved in checkpoint args so old ckpts still load | `model.py` (`local_weights`, `build_model`, `load_checkpoint`) |
| Change loss | plain BCE | BCE with `pos_weight` ≈ 2.0 (`--pos-weight`, auto from data) + soft Dice (`--dice-weight 1`) | `train.py` `dice_loss` |
| Semantic loss | CE inside changed pixels | + consistency loss (`--sc-weight 1`): cosine pull-together of the two softmaxes on unchanged pixels, push-apart where the class changed | `train.py` `consistency_loss` |
| Model selection | no separate val split | train.txt split in memory into "fit" (2003 pairs) and "val" (every 10th id, 223 pairs); val picks best.pt, test only for the final report. On-disk split untouched | `dataset.read_ids` |
| Inference | threshold 0.5, no TTA | 4-way flip TTA (`predict_probs(tta=True)`) + change threshold swept 0.15–0.75 on val; `thresh`/`tta` stored in best.pt and used by `analyze.py` and `api.py` | `model.py` `predict`, `train.py` `tune_threshold` |
| Reporting | history only | `final_metrics.json` with test scores plain (0.5, no TTA) and tuned | `train.py` `evaluate` |
| Safety check | — | `--smoke` ~1 min end-to-end run into `weights/smoke/` (passed before launch); `--eval-batches` to cap eval | `train.py` |
| Epochs | 40 | 80 (overkill: val SeK peaked at epoch 28; use 30–35 next time) | command line |

Command used (with `PYTHONPATH=src`, detached via `Start-Process`, logs `train_run3.log` /
`train_run3.err.log`):
`.venv/Scripts/python.exe -u src/train.py --backbone resnet34 --epochs 80 --batch-size 8 --workers 4`
Speed was ~3 s/iteration (~13–14 min/epoch, ~18 h total); a Windows dataloader bottleneck is
suspected but unconfirmed. Run 1 weights are backed up in `weights/run1_baseline/`.

Result: test SeK 0.144 → **0.192** (tuned), change IoU 0.467 → 0.544, recall 0.53 → 0.67.

## 5. Status — in progress (as of 2026-09-13)

- **Run 1 (baseline) finished**, 40 epochs, backed up to `weights/run1_baseline/`.
  Plateaued from ~epoch 35: epoch 40 SeK 0.144 (best ~0.147), change IoU 0.467,
  semantic mIoU 0.673, change P 0.79 / R 0.53. Diagnosis: the change head under-predicts
  (changed pixels are ~20% of data, BCE was unweighted), which also starves the semantic
  heads, since they are supervised only inside changed regions.
- **Run 2 never ran**: `train_run2.log` stops at epoch 1 iteration 0 (process was likely killed
  with its session). Its only change, BCE `pos_weight` ≈ 2.0, is folded into run 3.
- **Run 3 training** (started 2026-09-13, detached via `Start-Process`, logs `train_run3.log` /
  `train_run3.err.log`), 80 epochs:
  `.venv/Scripts/python.exe -u src/train.py --backbone resnet34 --epochs 80 --batch-size 8 --workers 4`
  (with `PYTHONPATH=src`). Changes vs run 1:
  - ResNet-34 backbone (`--backbone`, local weights `weights/resnet34_imagenet.pt`; backbone is
    stored in checkpoint args and `model.load_checkpoint` reads it, so run 1 ckpts still load).
  - Change head loss = BCE(pos_weight≈2.0) + soft Dice (`--dice-weight 1`).
  - Semantic consistency loss (`--sc-weight 1`): cosine pull-together of the two softmaxes on
    unchanged pixels, push-apart where the class changed.
  - Trains on "fit" (train.txt minus every 10th id, 2003 pairs); "val" (every 10th, 223 pairs)
    picks best.pt. Carved in `dataset.read_ids`, the on-disk split is untouched. Test is only
    used for the final report.
  - After the last epoch: sweeps the change threshold 0.15–0.75 with 4-way flip TTA on val,
    writes `thresh` and `tta` into best.pt (analyze.py and api.py use them), and writes
    `final_metrics.json` with test scores both plain (0.5, no TTA) and tuned.
  - `--smoke` does a ~1 min end-to-end check into `weights/smoke/`; it passed before launch.
  It overwrites `weights/best.pt`, `last.pt`, `history.json` (run 1 is safe in `run1_baseline/`).
  Compare the tuned test SeK with run 1 (0.144) and keep the better run.
  **Timing:** launched 00:51 on 2026-09-13; ~3 s/iteration → ~13–14 min/epoch (250 iters + val)
  → ~17–18 h total, expected finish ~6–7 PM 2026-09-13. Early losses were falling normally
  (total 5.88 → 4.47 over the first 100 iters, stderr empty). 3 s/iter is slow for ResNet-34 at
  bs 8; a Windows dataloader bottleneck is suspected but unconfirmed.
  Target for the slide: SeK ~0.20 is competitive on SECOND.
- **Index files exist** (checked 2026-09-13): `index_gt.json` (GT, complete) and `index.json`
  (model, built 2026-09-12 from the **run 1** checkpoint). `index.json` must be rebuilt after run 3.
- **Frontend redesign done** (2026-09-13) for the defence-commander demo: situation overview
  (KPIs, activity breakdown, sector plot, level histogram, watchlist), query page with parsed-filter
  tokens and history, filterable tile explorer, tile assessment with swipe/flicker viewer,
  transition matrix, model-vs-GT summary, similar tiles, print brief. Built and screenshot-checked
  (headless Edge) against the live API; `npm run build` passes, oxlint has only warnings.
  Change levels: Severe ≥40%, High ≥25%, Moderate ≥10%, Low. "Activities" group the 30
  transitions (construction, removal, clearing, water, regrowth, veg shift, other) — frontend only.
  Upload flow (/api/analyze) not yet exercised in the new UI (avoided loading the model on the
  GPU while training runs).
- **API dev server** was started from a Claude session on 2026-09-13 (port 8000, log `api_dev.log`).
  It serves the built UI from `frontend/dist` at http://localhost:8000, so no Vite dev server is
  needed for a demo — just `npm run build` after frontend changes. It dies with its session.

## 6. Status — remaining

1–4. (done 2026-09-13) run 3 evaluated, `index.json` rebuilt, full flow checked. A run 3 API was
   left on port **8001** (log `api_run3.log`); a stale run-1-index API from an earlier session was
   still on 8000 (PID 10140) and could not be stopped from Claude. Use 8001, or kill 8000 and restart.
5–8. (done 2026-09-13, commit 1f6082b) `requirements.txt` (with cu121 index), `.gitignore`
   (history.json + final_metrics.json are committed as evidence), README with results table and
   one-command demo, everything committed on `main`.
9. (done via API) upload flow works; not yet clicked through the drop zones in a real browser.

## 7. Gotchas

- `data/second` is a **symlink** to `/c/dataa/second`; the dataset is not in the repo.
- `src/` modules import each other flat (`from classes import ...`), so run with `--app-dir src`
  or from a working directory where that resolves.
- The API loads the index into RAM at startup but loads the model lazily on first `/api/analyze`,
  so query/gallery still work without a checkpoint.
- The user is token-cost-conscious: while training runs, stay idle and don't poll logs unless asked.
- The Claude-in-Chrome extension may not be connected. For visual checks, headless Edge works:
  `"/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless=new --disable-gpu
  --user-data-dir=<scratch> --window-size=1440,1500 --virtual-time-budget=8000
  --screenshot=<out.png> "http://localhost:8000/#/"`
- `train.log` and `analyze_gt.log` are full of `\r` progress bars — pipe through
  `tr '\r' '\n' | grep -v '%|'` before reading.
