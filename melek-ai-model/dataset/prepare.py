import argparse
import hashlib
import json
import random
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def clean_text(text: str) -> str:
    text = unicodedata.normalize("NFKC", text)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"\n[ \t]+", "\n", text)
    return text.strip()


def prepare(source: str | Path, out_dir: str | Path, seed: int = 42, val_fraction: float = 0.1):
    source = Path(source)
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    source_rows = json.loads(source.read_text(encoding="utf-8")).get("facts", [])
    examples = []
    seen = set()
    for fact in source_rows:
        fact_id = str(fact.get("id", "")).strip()
        source_file = fact.get("source", {}).get("file", "index.html")
        for language, field in (("en", "text_en"), ("fr", "text_fr"), ("ar", "text_ar")):
            text = clean_text(str(fact.get(field, "")))
            if not text:
                continue
            normalized = unicodedata.normalize("NFKC", text).lower()
            if normalized in seen:
                continue
            seen.add(normalized)
            examples.append({
                "text": text,
                "source": f"owner-portfolio-public:{source_file}:{fact_id}",
                "license": "owned",
                "language": language,
            })

    if len(examples) < 20:
        raise ValueError("owner corpus is too small for a meaningful split")
    rng = random.Random(seed)
    rng.shuffle(examples)
    split = max(1, int(len(examples) * (1 - val_fraction)))
    train = examples[:split]
    val = examples[split:]
    if not val:
        val = examples[-1:]
        train = examples[:-1]

    def write(name, rows):
        path = out_dir / name
        with path.open("w", encoding="utf-8", newline="\n") as handle:
            for row in rows:
                handle.write(json.dumps(row, ensure_ascii=False) + "\n")
        return path

    train_path = write("train.jsonl", train)
    val_path = write("validation.jsonl", val)
    manifest = {
        "schema": "melek-ai-dataset-v1",
        "seed": seed,
        "source": str(source),
        "license": "owned",
        "license_basis": "Public portfolio statements extracted from repository-owned portfolio content.",
        "cleaning": "NFKC normalization, newline normalization, whitespace collapse, exact normalized deduplication.",
        "train_rows": len(train),
        "validation_rows": len(val),
        "train_sha256": hashlib.sha256(train_path.read_bytes()).hexdigest(),
        "validation_sha256": hashlib.sha256(val_path.read_bytes()).hexdigest(),
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest, ensure_ascii=False))
    return manifest


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=ROOT.parent / "melek-ai/knowledge_base.json")
    parser.add_argument("--out", type=Path, default=ROOT / "dataset/owner-corpus")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--val-fraction", type=float, default=0.1)
    args = parser.parse_args()
    if not 0.05 <= args.val_fraction <= 0.5:
        raise SystemExit("--val-fraction must be between 0.05 and 0.5")
    prepare(args.source, args.out, args.seed, args.val_fraction)


if __name__ == "__main__":
    main()
