---
description: Build the frontend and start the Change Lens API (serves the built UI on :8000)
---

Start Change Lens for a demo/dev session. Do this, in order:

1. Verify `.venv` exists (Python 3.11 venv with the CUDA torch stack). If missing, tell the
   user to follow `setup.txt` steps 1–2 first — don't create the venv yourself, it needs the
   `--system-site-packages` flag and a specific base interpreter.
2. Verify `data/second` symlink, `weights/best.pt`, and `data/analyzed/index.json` (or
   `index_gt.json`) exist. If any are missing, say what's missing and stop — don't try to
   regenerate the split, retrain, or re-run analyze.py without being asked, since those are
   long/expensive operations.
3. Build the frontend:
   `cd frontend && npm install && npm run build`
4. Start the API in the background (it serves the built UI same-origin, no separate frontend
   server needed):
   `.venv/Scripts/python.exe -m uvicorn api:app --app-dir src --port 8000`
   Log to a file (e.g. `api.log`) and run detached so it survives the turn ending.
5. Report the URL: http://localhost:8000

If the user instead wants live frontend development (hot reload), run `npm run dev` in
`frontend/` instead of building, and point them at http://localhost:5173 with the API still
running on :8000 (Vite proxies via `VITE_API`).

Never kill or restart an already-running API/frontend process without checking with the user
first — another session may be using it (see CLAUDE.md §6 for a prior instance of this).
