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
- FastAPI backend with all endpoints incl. upload-and-analyze.
- React frontend: query view with example chips, gallery with paging, upload drop zones,
  detail view with a Model / Ground-Truth toggle.

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
  Upload flow (/api/analyze) not yet exercised in the new UI.

## 6. Status — remaining

1. Let run 3 finish all 80 epochs; read `weights/final_metrics.json` (tuned vs plain test SeK).
2. (done) `index_gt.json` exists.
3. Re-run `analyze.py` (model source) against the final run 3 `weights/best.pt` to rebuild
   `index.json` — the current one is from run 1. Restart the API afterwards (index loads at startup).
4. Start the API + frontend together and walk the full flow end to end
   (query → results → detail → GT toggle → upload).
5. Write `requirements.txt` (or pyproject) pinning torch 2.5.1+cu121 and the rest.
6. Add a `.gitignore` — `.venv/`, `data/`, `weights/`, `uploads/`, `*.log`, `frontend/node_modules/`
   are all currently untracked and should stay out of git.
7. Nothing in this project is committed yet. Branch is `master`; the last two commits are
   unrelated leftovers ("Remove repository contents", "Add tic-tac-toe game"). Decide on the
   branch/commit story before the first real commit.
8. README for the repo root (frontend has its own default Vite README).

## 7. Gotchas

- `data/second` is a **symlink** to `/c/dataa/second`; the dataset is not in the repo.
- `src/` modules import each other flat (`from classes import ...`), so run with `--app-dir src`
  or from a working directory where that resolves.
- The API loads the index into RAM at startup but loads the model lazily on first `/api/analyze`,
  so query/gallery still work without a checkpoint.
- `train.log` and `analyze_gt.log` are full of `\r` progress bars — pipe through
  `tr '\r' '\n' | grep -v '%|'` before reading.
