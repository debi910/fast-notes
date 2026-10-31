# One command: real Community Notes data -> web/public/data -> commit.
# Run from the repo root in PowerShell (works in the TRMI terminal too):
#     powershell -ExecutionPolicy Bypass -File pipeline\run_real.ps1
# Re-running is safe: finished downloads are skipped.
param(
    [int]$Ratings = 1,        # ratings files to download (each is large; 1 is usually enough)
    [int]$MaxNotes = 1000,
    [switch]$NoCommit
)
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

$py = "pipeline\.venv\Scripts\python.exe"
if (-not (Test-Path $py)) {
    Write-Host "== Creating Python venv" -ForegroundColor Cyan
    py -m venv pipeline\.venv
}
Write-Host "== Installing Python packages" -ForegroundColor Cyan
& $py -m pip install -q -r pipeline\requirements.txt

Write-Host "== 1/3 Downloading public Community Notes data (notes, status history, $Ratings ratings file)" -ForegroundColor Cyan
& $py pipeline\download.py --ratings $Ratings
if ($LASTEXITCODE -ne 0) {
    Write-Host "Automatic download failed. Open https://x.com/i/communitynotes/download-data (signed in)," -ForegroundColor Yellow
    Write-Host "save notes-00000, noteStatusHistory-00000 and ratings-00000 into data\raw\, then run this script again." -ForegroundColor Yellow
    exit 1
}

Write-Host "== 2/3 Sampling, fitting the bridging model and replaying (a few minutes)" -ForegroundColor Cyan
& $py pipeline\build_real.py --max-notes $MaxNotes
if ($LASTEXITCODE -ne 0) {
    Write-Host "build_real.py failed. If it says too few notes, run again with -Ratings 2." -ForegroundColor Yellow
    exit 1
}

Write-Host "== 3/3 Validating the JSON the web app reads" -ForegroundColor Cyan
& $py pipeline\validate_data.py
if ($LASTEXITCODE -ne 0) { Write-Host "Validation failed; nothing committed." -ForegroundColor Yellow; exit 1 }

& $py pipeline\make_writeup.py

if (-not $NoCommit) {
    git add web/public/data/showcase_notes.json web/public/data/raters.json web/public/data/results.json docs/DEVPOST.md
    git commit -m "Real Community Notes data: sample, bridging fit and replay"
    Write-Host "Committed. Push with: git push origin main" -ForegroundColor Green
}
Write-Host "Done. The site now shows real notes (isMock=false). Devpost text with the real numbers: docs\DEVPOST.md" -ForegroundColor Green
