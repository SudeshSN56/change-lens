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
                     /api/query /api/examples /api/stats /api/analyze  + /api/auth/* (see §5)
  auth.py            JWT (HS256, stdlib) + PBKDF2 user store (data/users.json) + roles viewer/analyst/admin
frontend/            React 19 + Vite 8, no extra deps. "Command console" UI, hash routing.
  src/App.jsx        routes: #/ overview, #/search?q=, #/explore, #/analyze, #/pair/{id}[?src=gt]
  src/lib/           constants.js (classes, change LEVELS, ACTIVITIES grouping), hooks.js (fetch, router, nav list)
  src/components/    Shell (sidebar/topbar), ui (badges, cards, tables), charts (hand-rolled SVG),
                     Compare (swipe/flicker/side-by-side + magnifier), Assessment (shared tile report)
  src/views/         Overview, Search, Explorer, Dossier (tile assessment), Analyze (upload),
                     Login (userid + password), Users (admin account management)
  src/lib/auth.js    token/user in sessionStorage (per tab), `useAuth`, `hasRole`, sign-in/out ("cl-auth" event)
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

**One-command start (outside Claude):** `start.bat` or `powershell -ExecutionPolicy Bypass -File start.ps1`
(`-Dev`, `-Port N`, `-NoBrowser`). Idempotent: venv + requirements, split only if missing, indexes only if
missing, npm install/build, then runs the API in the foreground and opens the browser. Refuses to start if
the port is already listening (never kills it). Never trains. Documented in `setup.txt` step 0.

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

## 5. Status — in progress (as of 2026-09-14)

- **Run 4 (fine-tune from run 3) abandoned 2026-09-14 — run 3 stays the final model. No more training.**
  It was launched detached (`train_run4.log`), but the process died at epoch 1 iteration 0 (like run 2,
  likely killed with its session); the user then chose to drop it because training is too slow.
  `weights/run4/` holds only smoke-test output. The `train.py` flags it added (`--init <ckpt>` loads
  weights only, `--out <dir>`) are kept. If training is ever revisited, fix speed first (cache decoded
  images, persistent workers, AMP, ~12–15 epochs) — ~3 s/iter makes runs take many hours.

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
- **Frontend trim + light mode (2026-09-16).** Removed from the UI: the top demo banner, the
  sidebar MODEL/INDEX/SEARCH spec block, the `Synthetic` tag (`SyntheticTag` in `ui.jsx`), the
  per-field `S` superscript and the "SECOND ships without per-pair geolocation..." footnote in
  the record-metadata panel. The synthetic fields themselves (coordinates, before/after image
  dates, platform) still display, and records still carry `"synthetic": true` in the API — only
  the labelling was dropped. Added a **Light / Dark toggle** in the topbar: `useTheme` in
  `lib/hooks.js` writes `data-theme` on `<html>` and persists to `localStorage["cl-theme"]`,
  `index.html` has a tiny inline script that applies it before first paint, and `theme.css` has a
  `:root[data-theme="light"]` block (variables + overrides for the hardcoded dark colours).
  Dark stays the default. Checked in headless Edge on the overview and tile-assessment pages.
- **Uploaded pairs now carry full metadata (2026-09-16).** `/api/analyze` builds the same
  metadata block as indexed records via `make_metadata`, seeded with `md5(before_bytes +
  after_bytes)` rather than the upload id, so re-uploading the same pair always resolves to the
  same sector/coordinates/dates instead of drifting per submission. The record keeps `uploaded:
  true` plus the derived `native_size_before/after`. `Assessment.jsx` now renders one shared
  "Record metadata" field list (Sector, Coordinates, Before image, After image, Platform, Record
  source) for both indexed and uploaded records, appending Analysis id and the native sizes only
  for uploads. `data/second/metadata.json` holds a hand-editable placeholder record for **all
  2968 pairs** (train + test), keyed by pair id, in the shape `{pair_id, source, metadata{region,
  lat, lon, date_before, date_after, satellite}}`. Regenerate it with
  `PYTHONPATH=src .venv/Scripts/python.exe src/metadata.py --dump data/second/metadata.json`
  (`dump_all` in `metadata.py`); it is md5-seeded so the values are reproducible. Unlike the
  generated records it carries **no `synthetic` key** and uses a single platform
  (`PLACEHOLDER_PLATFORM`, "Airborne optical sensor") for every pair instead of the four rotating
  descriptors in `SATELLITES`.
- **`data/second/metadata.json` is now the source of truth for metadata (2026-09-16).** `api.py`
  loads it at startup (`load_pair_metadata`, `STATE["pair_meta"]`) and merges it over the metadata
  baked into `index.json`, so editing a record there and restarting the API changes it across the
  whole UI. Side effect: every indexed tile's Platform now reads "Airborne optical sensor",
  because the file uses one platform for all pairs. A missing or malformed file is not fatal —
  it logs a warning and the generated values stand.
- **Uploads resolve to a dataset tile by file name (2026-09-16).** `resolve_pair_id` in `api.py`
  tries the file stem, then any digit run in it, then the run zero-padded to 5, against the
  metadata file (falling back to the index), so uploading `00003.png` / `im1_00003.jpg` /
  `00003_before.png` shows tile 00003's metadata and a **Matched tile** row in the assessment.
  Matching is on the name only, never the pixels; an unmatched upload falls back to
  `make_metadata(md5(before_bytes + after_bytes))` and reads "None — unseen imagery".

- **Login / JWT / RBAC added (2026-09-18).** `src/auth.py` + routes in `api.py`:
  `POST /api/auth/login {userid,password}` → `{token, user}` (HS256 JWT, 8 h, also set as an
  httpOnly `cl_token` cookie so `<img src="/media/...">` works), `POST /api/auth/logout`,
  `GET /api/auth/me`, `POST /api/auth/password`, admin-only `GET/POST /api/auth/users` and
  `DELETE /api/auth/users/{id}`. Every `/api/*` route except health/login now needs a token
  (`Depends(current_user)`); `/api/analyze` needs `require("analyst")`; `/media/*` and
  `/uploads/*` are checked in the `guard_media` middleware (header or cookie). Roles ranked
  viewer < analyst < admin. Users live in `data/users.json` (gitignored, PBKDF2 hashes, ids
  upper-cased; login is case-insensitive); it is created on first start with the defaults
  **JOHNDOE / john@123 (analyst)** and **ADMIN / admin@123 (admin)** — delete the file to
  regenerate. Signing secret: `CHANGELENS_JWT_SECRET` env or auto-generated `data/.jwt_secret`
  (gitignored). Frontend: `App.jsx` shows `views/Login.jsx` until `useAuth()` has a user; fetch
  helpers in `hooks.js` add `Authorization: Bearer` and call `signOut()` on any 401 (back to the
  login page); `Shell.jsx` shows the user chip + Sign out and filters nav by role (Analyze needs
  analyst, User accounts needs admin); `#/users` is the admin page. Verified with curl on all
  role combinations and headless-Edge screenshots (login, overview, users). API restarted on
  8000 (log `api.log`) with the new code.
  **Sessions last 24 h (user request, 2026-09-18, replacing the earlier per-tab design):** the
  token lives in `localStorage` (shared across tabs, survives closing the browser; a `storage`
  listener in `useAuth` keeps tabs in sync), there is no sign-out on tab switch, `TOKEN_TTL`
  defaults to 24 h (`CHANGELENS_TOKEN_TTL` env overrides) and the `cl_token` cookie carries
  `max_age=TOKEN_TTL`. A session ends only on explicit Sign out or JWT expiry.

- **Batch uploads (2026-09-18).** `POST /api/analyze/batch` takes parallel `before[]` /
  `after[]` file lists (paired by index, max 50, analyst role) and returns
  `{batch_id, n, n_ok, items[{index, before_name, after_name, ok, result | error}]}`; one bad
  pair does not fail the batch. The per-pair logic is `analyze_pair()` in `api.py`, shared with
  the single `/api/analyze` route, and the record metadata now also carries `file_before` /
  `file_after`. `views/Analyze.jsx` has two multi-file drop zones; files are paired by the
  longest digit run in their names (`00003_before` ↔ `00003_after`, `im1_00003` ↔ `im2_00003`),
  leftovers in name order, with a pairing preview and unpaired-file warning before running. The
  batch is sent in chunks of 4 so the results table (status, level, changed %, primary
  transition, matched tile) fills in progressively; clicking a row opens its full assessment
  below, with summary KPIs above. A single pair still shows the assessment directly. The brief
  for one pair is the `Brief` component (title, print-only before/after/change-map strip,
  summary, body); **Print all briefs** on the batch panel mounts a `print-only .print-all`
  block with one `Brief` per finished pair (`break-after: page` between them), waits for the
  images, calls `window.print()`, and unmounts on `afterprint`. The per-pair "Print brief"
  button still prints only the selected pair.

- **"Quiet graphite" restyle (2026-10-10), replacing the same-day ui-ux-pro-max look** (navy, blue
  to cyan gradients, glows, radar, uppercase eyebrows), which the user said looked AI-generated.
  Rules, all in `theme.css` tokens: the interface is greyscale (`--bg #111214`, `--panel #17181b`,
  hairline `--line`), and **colour is reserved for data**: level colours, SECOND class colours,
  imagery, the transition ramp, `--inc`/`--dec`. Primary button = ink (`--accent`, near-white in
  dark, near-black in light). Fonts **IBM Plex Sans + IBM Plex Mono** (mono only for numbers, ids,
  dates). No gradients (except the transition-matrix hatch and the login scrim), no glows,
  `backdrop-filter`, grain, grid background, entrance animations or `text-transform: uppercase`.
  Labels are sentence case. Panels are flat (radius 8, 1px border); KPI strips (`.kpis`) are one
  ruled grid (1px gaps over `--line`), not separate cards. Light theme = token swap plus 4 overrides.
  Markup: no eyebrows above headings (`PageHead` has no `eyebrow` prop; in-panel `.eyebrow` spans
  are plain 13px labels), `Stat` has no `icon`/`tone`, titles read "Tile 02353" / "Analysis …".
  Brand mark = `public/favicon.svg` (two offset frames; it replaced the default Vite bolt), used as
  `<img>` in the sidebar and on login. Login left half = real test tile 02353 split before/after
  (`public/login-before.jpg`, `login-after.jpg`, from `video/public/`; public because login is
  pre-auth and `/media` needs a token). Sidebar 240px. Pre-restyle copy of `frontend/src`,
  `index.html` and `public/` was kept only in the session scratchpad (no commit, by user choice).
  Still valid from the earlier pass: watchlist thumbnail `max-width:none` fix; Tile assessment and
  upload result (`Dossier`, `Analyze` `Brief`) pin `.dossier-media` imagery left (sticky, off below
  1200 px); `AssessmentBody` is one "Change analysis" panel with tabs (stored in
  `localStorage["cl.assess.tab"]`, every `.pane` shows in print); Search = query box first, then a
  300 px sticky rail beside results; Explorer = sticky filter aside + gallery. Checked with headless
  Edge over CDP in both themes and at 390 px. **Screenshot gotcha:** `auth.js` signs out on
  `visibilitychange: hidden`, which a page reload fires while unloading, so after signing in,
  navigate with `location.hash` only.

- **API dev server** serves the built UI from `frontend/dist` at http://localhost:8000, so no Vite
  dev server is needed for a demo — just `npm run build` after frontend changes. It dies with its
  session. Note that uvicorn loads the Python code at startup: after editing anything under `src/`
  the API must be restarted, while frontend rebuilds are picked up from disk on reload. A stale
  API plus a fresh build is what makes the metadata panel show all `—`. The 2026-09-13 instance
  (PID 11696) was stopped with the user's approval on 2026-09-16 and restarted on 8000
  (log `api.log`) to pick up the metadata changes.

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

## 8. Deployment — public tunnel (2026-09-20)

The site is deployed by running the API locally and putting a Cloudflare **quick tunnel** in
front of it. Nothing is uploaded to a host: the ~900 MB of overlays + test imagery and the
282 MB checkpoint stay on this machine, and upload analysis keeps running on the local GPU
(~2.4 s warm per pair, ~6 s on the first call while the model loads).

```bash
# 1. build the UI (only needed after frontend changes)
cd frontend && npm run build

# 2. API on localhost only -- the tunnel is the access path
.venv/Scripts/python.exe -m uvicorn api:app --app-dir src --host 127.0.0.1 --port 8000 > api_deploy.log 2>&1 &

# 3. public HTTPS URL (prints it into tunnel.log)
tools/cloudflared.exe tunnel --url http://127.0.0.1:8000 --no-autoupdate > tunnel.log 2>&1 &
grep -oE "https://[a-z0-9-]+\.trycloudflare\.com" tunnel.log | head -1
```

`tools/cloudflared.exe` is the standalone binary (v2026.9.1), gitignored — re-download from
`github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe`.

**Properties of a quick tunnel.** The hostname is random and ephemeral: it changes every time
cloudflared restarts, and the link dies with the process. There is no Cloudflare account or
domain involved. For a stable hostname you need a named tunnel, which needs an account + a
domain on Cloudflare.

**Both processes die with the session that started them**, same as the dev API — a demo needs
them (re)started first, and the URL re-read from `tunnel.log`.

**Credentials on the public URL.** By explicit user decision (2026-09-20) the deployed instance
keeps the demo defaults **JOHNDOE / john@123** and **ADMIN / admin@123**. Anyone with the link
can sign in, so the link is treated as the secret: keep it private, stop the tunnel after a demo.
`data/.jwt_secret` and `data/users.json` persist on disk, so sessions survive an API restart.

Verified end-to-end over the public URL on 2026-09-20: SPA + assets, `/api/health`, 401 on
unauthenticated `/api/pairs`, login, `/api/query` ("where did trees become buildings" → 5 hits,
parsed `tree → buildings`, not relaxed), `/api/stats`, `/api/examples`, pair detail, `?source=gt`,
`/similar`, `/media/analyzed/overlays/*.png`, `/media/second/im1|im2/*.png`, and `/api/analyze`
(pair 00003 → 44.0% changed, `metadata.matched_pair_id` = `00003`).

Known UI nit found during the check, not fixed: `views/Login.jsx` still reads "The session is
tied to this tab and ends as soon as you leave it", which describes the pre-2026-09-18 design.
Sessions are now 24 h in `localStorage` and shared across tabs.

## 9. Intro video (2026-10-10)

45 s, 1920×1080, 30 fps, **silent** MP4 introducing the project, styled after the Paper Mono
launch film (whatships.com/videos/paper-mono): off-white paper `#F2F1EC`, ink `#1E1E1E`, blue
`#78A8E8`, design-tool windows with an offset blue shadow, a moving cursor, blue pixel-block
wipes on cuts, and a faint blue ASCII "lens" generated from tile 02353 (`video/make_ascii.py` ->
`video/src/ascii.js`). Built with **Remotion 4.0.525** in its own folder `video/` (own
`package.json`; renderer ships ffmpeg, which is not installed system-wide).

```bash
cd video && npm install          # once; npm blocks esbuild's postinstall, harmless (binary is in @esbuild/win32-x64)
npm run studio                   # live preview / tweak in the browser
npm run render                   # -> video/out/change-lens-intro.mp4 (~1.5 min, ~6 MB)
```

Scenes (`video/src/Intro.jsx` holds order + lengths): open (icon on ASCII lens) · "introducing"
in 6 weights · title + question · tile 02353 swipe 2017-02-14 -> 2019-02-06 · change map + units ·
query "where did trees become buildings" with the 6 live results · dark beat with test scores
from `weights/final_metrics.json` (tuned) · two light-theme UI screenshots · end card that erases
back to the icon. Every number/image is real project data; result tiles and stats were read from
the live API on 2026-10-10. `video/out/` and `node_modules/` are gitignored.

## 10. Startup intro with voiceover (2026-10-11)

A separate website intro in `startup-intro/` (the `video/` film above is untouched). It runs 40.8 s at
1920×1080 and 60 fps, with a continuous voiceover, music and SFX. The style is a minimalist SaaS ad:
white scenes, one #080808 product block, Inter, and accent `#3B6FD8` on key words and on the logo's
filled square. It was built from the user's brief, with the user choosing the accent and the end-card
URL `github.com/SudeshSN56/change-lens`. The X reference video could not be fetched.

The first cut (2026-10-11 morning) was 30 s and showed only search. The user asked for **every
feature**, a **voice with no breaks**, and up to 45 s, which produced the current version.

```bash
cd startup-intro && npm install
../.venv/Scripts/python.exe gen_audio.py              # music (60 s) + SFX (numpy synthesis, seeded)
.venv-voice/Scripts/python.exe gen_voice.py           # voice -> public/audio/line01..11.mp3 + timings.json
npm run studio                                        # preview
npm run render                                        # -> out/startup-intro.mp4 (~3 min)
../.venv/Scripts/python.exe qa.py                     # contact sheet, audio envelope, voice placement
```

- **Script:** `script.txt` holds 11 narration lines. Scenes, in `SCENES` in `src/Intro.jsx`:
  1. Opening
  2. Headline
  3. Overview (KPIs, level histogram, activity breakdown)
  4. Ask (query, parsed `Transition` token, results)
  5. Explorer (Sector, Severe and New construction filters narrow the grid: 742, 249, 23, 17 tiles)
  6. Tile, one dark window across 2 lines: swipe compare, then the model change map
  7. Similar tiles
  8. Upload (batch table, `Print all briefs`)
  9. Scale ("Everything is searchable in seconds.")
  10. End

  On-screen text is a short headline per scene, not the full spoken line.
- **Timing:** the narration is continuous. `gen_voice.py` sets `LEAD` 0.5 s of music before the first
  word, `PAUSE` 0.2 s between lines (about 0.45 s of real silence), and `END_HOLD` 1.5 s after the
  last word. `Intro.jsx` builds each scene's length and per-line `cues`/`vos` from `timings.json`.
  Mid-line sync (e.g. the second half of a line) uses fractions of the line's duration, measured
  from the clips' internal pauses.
- **Voice is Kokoro-82M** (Apache-2.0, local, voice `af_heart`), not Fish Audio.
  - Fish returned `402 Insufficient API credit` for every model, including `s2.1-pro-free`. API credit
    is billed separately from the fish.audio app subscription.
  - `gen_voice.py --engine fish --voice <reference_id>` still works once the account has credit.
  - The Fish key is in `startup-intro/.env` (gitignored). It was pasted in chat, so it should be rotated.
- **Kokoro has its own venv, `startup-intro/.venv-voice`** (gitignored, `--system-site-packages`
  for the CUDA torch). It must stay separate: in the project `.venv`, kokoro's deps could shadow the
  CUDA torch the API needs. It also needs `transformers==4.51.3`, because 5.x calls
  `torch.accelerator`, which torch 2.5.1 does not have.
  - The clips are trimmed to the speech and normalised to -16 dBFS RMS.
- **Typing sync:** `CPS` in `src/theme.js` is shared by `<Typed>` and `type.wav`, and `gen_audio.py`
  reads it from the theme. Rerun `gen_audio.py` after changing it.
- **Tools:** Remotion's bundled ffmpeg/ffprobe (`node_modules/@remotion/compositor-win32-x64-msvc/`)
  are the only ones on this machine. They lack the `fps`/`select` filters and the raw `s16le` muxer,
  which is why `qa.py` seeks once per frame and decodes through a temp wav.
- **Real data only.** Each number is hard-coded in its scene, with its source in a comment:
  - Overview stats, computed from `data/analyzed/index.json` with the frontend's LEVELS/ACTIVITIES.
  - Explorer filter states, using the same filtering as `views/Explorer.jsx`.
  - `/api/examples` chips, and the results for "where did trees become buildings".
  - Tile 02353's model numbers (`02353.json`).
  - Similar tiles, from `search.SimilarityIndex`.
  - The batch rows: test pairs 00003, 00045, 00020 and 00046.
  - Images in `public/` are copies: `ov_*` overlays, `im1_*` and `im2_*` raw pairs.
- **Legend crop:** overlay PNGs are cropped 1.3× from the top (`LEGEND_CROP` in `src/ui.jsx`). A 1.2×
  crop left six-class legends showing.
