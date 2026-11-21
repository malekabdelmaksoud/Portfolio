"""Fetch a bounded, license-filtered multilingual corpus from public Hugging Face datasets.

No data is committed to Git. Every output row stores its dataset identifier,
upstream record identifier, and exact normalized license for auditability.
"""
import argparse
import json
import re
import sys
from pathlib import Path

from datasets import load_dataset

from dataset import normalize_license

LANGUAGE_ALIASES = {
    "en": "en", "eng": "en", "english": "en",
    "fr": "fr", "fra": "fr", "fre": "fr", "french": "fr",
    "ar": "ar", "arb": "ar", "ara": "ar", "arabic": "ar",
}
ALLOWED_COMMON_LICENSES = {"public-domain", "cc0-1.0", "cc-by-4.0", "mit", "apache-2.0"}
PII_PATTERNS = (
    re.compile(r"(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b"),
    re.compile(r"(?<!\w)(?:\+?\d[\d .()/-]{7,}\d)(?!\w)"),
)


def clean_text(value):
    if not isinstance(value, str):
        return ""
    value = value.replace(chr(0), " ")
    value = re.sub(r"\s+", " ", value).strip()
    if len(value) < 180 or len(value) > 12000:
        return ""
    if any(pattern.search(value) for pattern in PII_PATTERNS):
        return ""
    return value


def record_key(text):
    import hashlib
    return hashlib.sha256(text.casefold().encode("utf-8")).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=Path("data/train.jsonl"))
    parser.add_argument("--max-per-language", type=int, default=1200)
    parser.add_argument("--max-scan", type=int, default=150000,
                        help="Maximum Common Corpus records inspected; streaming is bounded by this limit.")
    parser.add_argument("--skip-common-corpus", action="store_true")
    parser.add_argument("--skip-tunisian-parallel", action="store_true")
    args = parser.parse_args()
    if args.max_per_language < 1 or args.max_scan < 1:
        parser.error("--max-per-language and --max-scan must be positive")

    args.out.parent.mkdir(parents=True, exist_ok=True)
    seen = set()
    counts = {"en": 0, "fr": 0, "ar": 0, "aeb": 0}
    sources = []

    def append(text, source, license_name, language):
        text = clean_text(text)
        if not text:
            return False
        key = record_key(text)
        if key in seen:
            return False
        seen.add(key)
        row = {"text": text, "source": source, "license": license_name, "language": language}
        handle.write(json.dumps(row, ensure_ascii=False) + "\n")
        counts[language] += 1
        return True

    with args.out.open("w", encoding="utf-8") as handle:
        if not args.skip_common_corpus:
            print("Streaming PleIAs/common_corpus (only public-domain, CC0, CC-BY 4.0, MIT, Apache-2.0)...")
            try:
                stream = load_dataset("PleIAs/common_corpus", split="train", streaming=True)
                stream = stream.shuffle(seed=42, buffer_size=20000)
                scanned = 0
                for row in stream:
                    scanned += 1
                    if scanned > args.max_scan:
                        break
                    lang = LANGUAGE_ALIASES.get(str(row.get("language", "")).strip().lower())
                    if lang not in {"en", "fr", "ar"} or counts[lang] >= args.max_per_language:
                        if all(counts[key] >= args.max_per_language for key in ("en", "fr", "ar")):
                            break
                        continue
                    license_name = normalize_license(row.get("license"))
                    if license_name not in ALLOWED_COMMON_LICENSES:
                        continue
                    identifier = row.get("identifier")
                    if not isinstance(identifier, str) or not identifier.strip():
                        continue
                    source = (
                        "PleIAs/common_corpus"
                        f" | identifier={identifier[:500]}"
                        f" | collection={str(row.get('collection', 'unknown'))[:120]}"
                        f" | creator={str(row.get('creator', 'unknown'))[:160]}"
                    )
                    append(row.get("text"), source, license_name, lang)
                print(f"Common Corpus scanned={min(scanned, args.max_scan)}; counts={counts}")
                sources.append("PleIAs/common_corpus")
            except Exception as exc:
                print(f"WARNING: Common Corpus download stopped: {exc}", file=sys.stderr)

        if not args.skip_tunisian_parallel:
            print("Loading Tunisia.AI Tunisian ↔ MSA corpus (CC-BY-4.0)...")
            try:
                stream = load_dataset(
                    "tunis-ai/tunisian-msa-parallel-corpus",
                    split="part_0",
                    streaming=True,
                )
                for row in stream:
                    chunk_id = str(row.get("chunk_id") or row.get("original_text_id") or "unknown")
                    # Keep the original Tunisian text, not generated translation explanations.
                    tunisian = row.get("original_text") or row.get("chunk_text")
                    if append(
                        tunisian,
                        f"tunis-ai/tunisian-msa-parallel-corpus | chunk_id={chunk_id}",
                        "cc-by-4.0",
                        "aeb",
                    ) and counts["aeb"] >= args.max_per_language:
                        break
                sources.append("tunis-ai/tunisian-msa-parallel-corpus")
            except Exception as exc:
                print(f"WARNING: Tunisian parallel corpus unavailable: {exc}", file=sys.stderr)

    total = sum(counts.values())
    print(f"Saved {total} unique documents to {args.out}")
    print("Language counts:", json.dumps(counts, ensure_ascii=False))
    print("Sources:", ", ".join(sources) if sources else "none")
    if total < 2:
        raise SystemExit(
            "No usable corpus was downloaded. Check internet access and dataset availability; "
            "the script intentionally refuses to invent or silently substitute training text."
        )
    if any(counts[lang] == 0 for lang in ("en", "fr", "ar")):
        print("WARNING: One or more Common Corpus languages have zero examples; adjust --max-scan or inspect source availability.")
    if counts["aeb"] == 0:
        print("WARNING: No Tunisian dialect rows were retrieved; inspect the upstream dataset release.")
    print("Review data/SOURCES.md and inspect sample rows before training.")


if __name__ == "__main__":
    main()
