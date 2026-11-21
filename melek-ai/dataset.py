"""Validate and split owner-provided MelekGPT training documents.

This module intentionally uses only the Python standard library so corpus checks
can run in CI without installing PyTorch or reading private training data.
"""
import json
import random
from pathlib import Path

ALLOWED_LICENSES = {"owned", "permitted", "public-domain"}


def load_documents(path: Path) -> list[str]:
    documents = []
    seen = set()
    with path.open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, 1):
            if not line.strip():
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError as exc:
                raise ValueError(f"Invalid JSON on line {line_number}") from exc
            if not isinstance(row, dict):
                raise ValueError(f"Line {line_number} must contain a JSON object")
            text = row.get("text")
            source = row.get("source")
            license_name = row.get("license")
            if not isinstance(text, str) or not text.strip():
                raise ValueError(f"Line {line_number} needs non-empty text")
            if not isinstance(source, str) or not source.strip():
                raise ValueError(f"Line {line_number} needs a non-empty source")
            if license_name not in ALLOWED_LICENSES:
                raise ValueError(
                    f"Line {line_number} needs license owned, permitted, or public-domain"
                )
            normalized = text.strip()
            fingerprint = normalized.casefold()
            if fingerprint in seen:
                continue
            seen.add(fingerprint)
            documents.append(normalized)
    if len(documents) < 2:
        raise ValueError("At least two distinct documents are required for a leakage-safe train/validation split")
    return documents


def split_documents(documents: list[str], seed: int = 42) -> tuple[list[str], list[str]]:
    if len(documents) < 2:
        raise ValueError("At least two documents are required")
    indices = list(range(len(documents)))
    random.Random(seed).shuffle(indices)
    validation_count = max(1, round(len(indices) * 0.1))
    validation_indices = set(indices[:validation_count])
    train = [doc for index, doc in enumerate(documents) if index not in validation_indices]
    validation = [doc for index, doc in enumerate(documents) if index in validation_indices]
    return train, validation
