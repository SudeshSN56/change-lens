# Change Lens - one-command setup + launch (Windows PowerShell 5.1+).
#
#   powershell -ExecutionPolicy Bypass -File start.ps1            # build UI, serve on :8000
#   powershell -ExecutionPolicy Bypass -File start.ps1 -Dev       # hot-reload UI on :5173, API on :8000
#   powershell -ExecutionPolicy Bypass -File start.ps1 -Port 8001 -NoBrowser
#
# Each step is skipped when it is already done, so re-running is cheap.
# It never retrains and never regenerates an existing split.

param(
    [int]$Port = 8000,
    [switch]$Dev,
    [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot
$Py = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"
$env:PYTHONPATH = "src"

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Ok($msg)   { Write-Host "    $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "    $msg" -ForegroundColor Yellow }
function Fail($msg) { Write-Host "`nERROR: $msg" -ForegroundColor Red; exit 1 }

function Run($exe, [string[]]$argv) {
    & $exe @argv
    if ($LASTEXITCODE -ne 0) { Fail "'$exe $($argv -join ' ')' failed (exit $LASTEXITCODE)" }
}

# 1. Python venv ---------------------------------------------------------------
Step "Python environment (.venv, Python 3.11)"
if (-not (Test-Path $Py)) {
    if (-not (Get-Command py -ErrorAction SilentlyContinue)) {
        Fail "The 'py' launcher was not found. Install Python 3.11 from python.org first."
    }
    & py -3.11 --version *> $null
    if ($LASTEXITCODE -ne 0) { Fail "Python 3.11 is not installed (py -3.11 failed). Bare 'python' may be 3.14, which has no CUDA torch." }
    Run py @("-3.11", "-m", "venv", ".venv")
    Ok "created .venv"
}

& $Py -c "import torch, torchvision, fastapi, uvicorn, cv2, multipart, sklearn, tqdm, PIL" *> $null
if ($LASTEXITCODE -ne 0) {
    Warn "installing requirements.txt (first run downloads CUDA torch, ~2.5 GB)"
    Run $Py @("-m", "pip", "install", "--upgrade", "pip")
    Run $Py @("-m", "pip", "install", "-r", "requirements.txt")
}
$cuda = & $Py -c "import torch; print(torch.cuda.is_available())"
Ok "dependencies OK (CUDA available: $cuda)"

# 2. Data, split, weights --------------------------------------------------------
Step "Dataset, split and checkpoint"
$hasData = Test-Path "data\second\im1"
if ($hasData) { Ok "data\second found" }
else { Warn "data\second is missing. Link it to the SECOND dataset, e.g. (admin cmd): mklink /J data\second C:\dataa\second" }

if ((Test-Path "data\splits\train.txt") -and (Test-Path "data\splits\test.txt")) {
    Ok "split exists (never regenerated)"
} elseif ($hasData) {
    Run $Py @("src\make_split.py")
    Ok "split written to data\splits"
} else {
    Warn "no split and no dataset - skipping"
}

$hasCkpt = Test-Path "weights\best.pt"
if ($hasCkpt) { Ok "weights\best.pt found" }
else { Warn "weights\best.pt missing - search on ground truth only, upload/analyze disabled. Train with: .venv\Scripts\python.exe src\train.py --backbone resnet34 --epochs 35 --batch-size 8 --workers 4" }

# 3. Search indexes --------------------------------------------------------------
Step "Search indexes (data\analyzed)"
if (Test-Path "data\analyzed\index_gt.json") { Ok "index_gt.json exists" }
elseif ($hasData) { Warn "building ground-truth index (a few minutes)"; Run $Py @("src\analyze.py", "--source", "gt") }

if (Test-Path "data\analyzed\index.json") { Ok "index.json exists" }
elseif ($hasData -and $hasCkpt) { Warn "building model index (runs the model over 742 pairs, several minutes)"; Run $Py @("src\analyze.py") }

if (-not ((Test-Path "data\analyzed\index.json") -or (Test-Path "data\analyzed\index_gt.json"))) {
    Fail "No search index could be built. Provide data\second (and weights\best.pt for model results)."
}

# 4. Frontend ------------------------------------------------------------------
Step "Frontend"
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { Fail "npm not found. Install Node.js 20+ from nodejs.org." }
Push-Location frontend
try {
    if (-not (Test-Path "node_modules")) { Run npm @("install") }
    if (-not $Dev) { Run npm @("run", "build"); Ok "built frontend\dist" }
} finally { Pop-Location }

# 5. Launch ----------------------------------------------------------------------
Step "Starting API on port $Port"
$busy = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($busy) {
    $procId = ($busy | Select-Object -First 1).OwningProcess
    Fail "Port $Port is already in use (PID $procId). Change Lens may already be running at http://localhost:$Port - otherwise stop that process or re-run with -Port 8001."
}

$api = Start-Process -FilePath $Py -NoNewWindow -PassThru -ArgumentList @(
    "-m", "uvicorn", "api:app", "--app-dir", "src", "--host", "127.0.0.1", "--port", "$Port")

$up = $false
for ($i = 0; $i -lt 60; $i++) {
    if ($api.HasExited) { Fail "API exited during startup (see output above)." }
    try { Invoke-RestMethod "http://127.0.0.1:$Port/api/health" -TimeoutSec 2 | Out-Null; $up = $true; break }
    catch { Start-Sleep -Seconds 1 }
}
if (-not $up) { Stop-Process -Id $api.Id -Force; Fail "API did not answer /api/health within 60 s." }

if ($Dev) {
    $url = "http://localhost:5173"
    Write-Host "`nAPI: http://localhost:$Port   UI (hot reload): $url   Ctrl+C to stop both`n" -ForegroundColor Green
    $env:VITE_API = "http://localhost:$Port"
    if (-not $NoBrowser) { Start-Process $url }
    Push-Location frontend
    try { & npm run dev } finally { Pop-Location; if (-not $api.HasExited) { Stop-Process -Id $api.Id -Force } }
} else {
    $url = "http://localhost:$Port"
    Write-Host "`nChange Lens is running at $url   (Ctrl+C to stop)`n" -ForegroundColor Green
    if (-not $NoBrowser) { Start-Process $url }
    try { Wait-Process -Id $api.Id } finally { if (-not $api.HasExited) { Stop-Process -Id $api.Id -Force } }
}
