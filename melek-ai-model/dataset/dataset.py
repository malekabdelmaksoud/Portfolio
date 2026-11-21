import json
from pathlib import Path

ALLOWED_LICENSES = {"owned", "permitted", "public-domain"}


def validate_row(row: object, line_number: int) -> dict:
    if not isinstance(row, dict):
        raise ValueError(f"line {line_number}: row must be a JSON object")
    text = row.get("text")
    source = row.get("source")
    license_name = row.get("license")
    if not isinstance(text, str) or not text.strip():
        raise ValueError(f"line {line_number}: text must be a non-empty string")
    if not isinstance(source, str) or not source.strip():
        raise ValueError(f"line {line_number}: source is required")
    if license_name not in ALLOWED_LICENSES:
        raise ValueError(f"line {line_number}: license must be owned, permitted or public-domain")
    return {"text": text, "source": source, "license": license_name}


def load_jsonl(path: str | Path) -> list[dict]:
    rows = []
    for line_number, line in enumerate(Path(path).read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError as exc:
            raise ValueError(f"line {line_number}: invalid JSON") from exc
        rows.append(validate_row(row, line_number))
    if not rows:
        raise ValueError("dataset is empty")
    return rows
