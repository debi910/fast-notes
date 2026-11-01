"""Download the public Community Notes data into data/raw/.

X publishes a fresh snapshot most days at
    https://ton.twimg.com/birdwatch-public-data/YYYY/MM/DD/<folder>/<file>-00000.zip
This script walks back from today until it finds a date that exists, then fetches
notes, note status history and N ratings files (default 1; each is large).

If every URL fails (X has changed the layout, or your network blocks ton.twimg.com),
download the files by hand from https://x.com/i/communitynotes/download-data and put
them in data/raw/ (zip or tsv both work). build_real.py reads either.

Usage (repo root):  pipeline\\.venv\\Scripts\\python.exe pipeline\\download.py [--ratings 1] [--days 14]
"""
from __future__ import annotations

import argparse
import sys
import urllib.error
import urllib.request
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
BASE = "https://ton.twimg.com/birdwatch-public-data"
HEADERS = {"User-Agent": "fast-notes-hackathon/1.0 (research; contact via GitHub)"}


def url_for(d: date, folder: str, name: str) -> str:
    return f"{BASE}/{d:%Y/%m/%d}/{folder}/{name}.zip"


def exists(url: str) -> bool:
    req = urllib.request.Request(url, method="HEAD", headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status == 200
    except (urllib.error.URLError, TimeoutError):
        return False


def fetch(url: str, dest: Path) -> None:
    if dest.exists() and dest.stat().st_size > 0:
        print(f"  have {dest.name}")
        return
    tmp = dest.with_suffix(dest.suffix + ".part")
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=300) as r, open(tmp, "wb") as f:
        total = int(r.headers.get("Content-Length") or 0)
        done = 0
        while chunk := r.read(1 << 20):
            f.write(chunk)
            done += len(chunk)
            if total:
                print(f"\r  {dest.name}: {done / total:6.1%} of {total / 1e6:,.0f} MB", end="", flush=True)
    print()
    tmp.replace(dest)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ratings", type=int, default=1, help="how many ratings-000XX files to fetch")
    ap.add_argument("--days", type=int, default=14, help="how many days back to look for a snapshot")
    ap.add_argument("--latest", action="store_true", help="fetch the highest-numbered ratings file (most recent ratings) instead of 00000")
    args = ap.parse_args()

    RAW.mkdir(parents=True, exist_ok=True)
    snap = None
    for back in range(args.days + 1):
        d = date.today() - timedelta(days=back)
        if exists(url_for(d, "notes", "notes-00000")):
            snap = d
            break
    if snap is None:
        print("No snapshot found. Download by hand from https://x.com/i/communitynotes/download-data into data/raw/.")
        return 1
    print(f"Snapshot {snap.isoformat()}")
    (RAW / "SNAPSHOT_DATE").write_text(snap.isoformat(), encoding="utf-8")

    files = [("notes", "notes-00000"), ("noteStatusHistory", "noteStatusHistory-00000")]
    if args.latest:
        last = -1
        while last < 99 and exists(url_for(snap, "noteRatings", f"ratings-{last + 1:05d}")):
            last += 1
        if last < 0:
            print("No ratings files found for this snapshot.")
            return 1
        print(f"Newest ratings file: ratings-{last:05d}")
        # Drop older ratings files so the build only samples recent notes.
        for old in RAW.glob("ratings-*"):
            if old.stem != f"ratings-{last:05d}":
                print(f"  removing {old.name}")
                old.unlink()
        files += [("noteRatings", f"ratings-{i:05d}") for i in range(max(0, last - args.ratings + 1), last + 1)]
    else:
        files += [("noteRatings", f"ratings-{i:05d}") for i in range(args.ratings)]
    for folder, name in files:
        fetch(url_for(snap, folder, name), RAW / f"{name}.zip")
    print("Done. Next: pipeline\\.venv\\Scripts\\python.exe pipeline\\build_real.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
