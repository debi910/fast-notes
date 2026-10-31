"""Validate web/public/data/*.json against schemas/*.schema.json, plus privacy checks."""
from __future__ import annotations

import json
import sys
from pathlib import Path

from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parents[1]
PAIRS = [("showcase_notes", "showcase_notes"), ("raters", "raters"), ("results", "results")]


def main() -> int:
    ok = True
    for data_name, schema_name in PAIRS:
        schema = json.loads((ROOT / "schemas" / f"{schema_name}.schema.json").read_text(encoding="utf-8"))
        data = json.loads((ROOT / "web" / "public" / "data" / f"{data_name}.json").read_text(encoding="utf-8"))
        errors = sorted(Draft202012Validator(schema).iter_errors(data), key=lambda e: list(e.path))
        for e in errors[:10]:
            print(f"[{data_name}] {'/'.join(map(str, e.path))}: {e.message}")
        ok &= not errors
        print(f"{data_name}.json: {'OK' if not errors else f'{len(errors)} errors'} (isMock={data.get('isMock')})")

    showcase = json.loads((ROOT / "web/public/data/showcase_notes.json").read_text(encoding="utf-8"))
    ids = {n["id"] for n in showcase["notes"]}
    missing = [c for c in showcase["calibrationNoteIds"] if c not in ids]
    if missing:
        ok = False
        print("calibrationNoteIds not in notes:", missing)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
