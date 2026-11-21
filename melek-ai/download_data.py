"""Fetch a bounded, license-filtered multilingual corpus from public Hugging Face datasets."""
import argparse
import json
import re
import sys
import unicodedata
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
TUNISIAN_BLOCKLIST = ("قحبة", "شرموطة", "منيك", "منيوك", "زبل", "زبلت", "متلاوث", "منبوز")
TUNISIAN_BLOCKED_PHRASES = ("اضرب القطوسة", "طاعة النساء", "طاعه النساء")


def clean_text(value, min_length=180):
    if not isinstance(value, str):
        return ""
    value = value.replace(chr(0), " ")
    value = re.sub(r"\s+", " ", value).strip()
    if len(value) < min_length or len(value) > 12000:
        return ""
    if any(pattern.search(value) for pattern in PII_PATTERNS):
        return ""
    return value


def safe_tunisian_text(value):
    normalized = unicodedata.normalize("NFKC", value).replace("ـ", "").casefold()
    normalized = "".join(char for char in normalized if unicodedata.category(char) != "Mn")
    if any(phrase in normalized for phrase in TUNISIAN_BLOCKED_PHRASES):
        return False
    for term in TUNISIAN_BLOCKLIST:
        if re.search(rf"(?<![\u0600-\u06FF]){re.escape(term)}(?![\u0600-\u06FF])", normalized):
            return False
    return True


def record_key(text):
    import hashlib
    return hashlib.sha256(text.casefold().encode("utf-8")).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=Path("data/train.jsonl"))
    parser.add_argument("--max-per-language", type=int, default=1200)
    parser.add_argument("--max-scan", type=int, default=150000)
    parser.add_argument("--skip-common-corpus", action="store_true")
    parser.add_argument("--skip-arabic-legal", action="store_true")
    parser.add_argument("--skip-tunisian-proverbs", action="store_true")
    args = parser.parse_args()
    if args.max_per_language < 1 or args.max_scan < 1:
        parser.error("--max-per-language and --max-scan must be positive")

    args.out.parent.mkdir(parents=True, exist_ok=True)
    seen = set()
    counts = {"en": 0, "fr": 0, "ar": 0, "aeb": 0}
    sources = []

    def append(text, source, license_name, language, min_length=180):
        text = clean_text(text, min_length=min_length)
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
            print("Streaming PleIAs Common Corpus with strict permissive-license filtering...")
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

        if not args.skip_arabic_legal:
            print("Loading University of Dubai Arabic legal text (CC-BY-4.0)...")
            try:
                stream = load_dataset("University-of-Dubai/arabic-legal-text", split="train", streaming=True)
                for row in stream:
                    if counts["ar"] >= args.max_per_language:
                        break
                    source = (
                        "University-of-Dubai/arabic-legal-text"
                        f" | law={str(row.get('source', 'unknown'))[:300]}"
                        f" | category={str(row.get('category', 'unknown'))[:100]}"
                        f" | year={str(row.get('year', 'unknown'))[:20]}"
                    )
                    append(row.get("text"), source, "cc-by-4.0", "ar")
                sources.append("University-of-Dubai/arabic-legal-text")
            except Exception as exc:
                print(f"WARNING: Arabic legal corpus unavailable: {exc}", file=sys.stderr)

        if not args.skip_tunisian_proverbs:
            print("Loading Tunisian proverb corpus (CC-BY-4.0) with a conservative abuse-word filter...")
            try:
                dataset_name = "HabibaAbderrahim/Tunisian-Proverbs-with-Image-Associations-A-Cultural-and-Linguistic-Dataset"
                stream = load_dataset(dataset_name, split="train", streaming=True)
                for row in stream:
                    if counts["aeb"] >= args.max_per_language:
                        break
                    parts = [
                        row.get("tunisan_proverb"),
                        row.get("context"),
                        row.get("proverb_arabic_explaination"),
                    ]
                    text = "\n".join(part.strip() for part in parts if isinstance(part, str) and part.strip())
                    if not safe_tunisian_text(text):
                        continue
                    source = f"{dataset_name} | proverb={str(row.get('tunisan_proverb', 'unknown'))[:300]}"
                    append(text, source, "cc-by-4.0", "aeb", min_length=50)
                sources.append(dataset_name)
            except Exception as exc:
                print(f"WARNING: Tunisian proverb corpus unavailable: {exc}", file=sys.stderr)

    total = sum(counts.values())
    print(f"Saved {total} unique documents to {args.out}")
    print("Language counts:", json.dumps(counts, ensure_ascii=False))
    print("Sources:", ", ".join(sources) if sources else "none")
    if total < 2:
        raise SystemExit("No usable corpus was downloaded; refusing to invent replacement training text.")
    for language in ("en", "fr", "ar", "aeb"):
        if counts[language] == 0:
            print(f"WARNING: No usable {language} records were retrieved.")
    print("Review data/SOURCES.md and inspect samples before training.")


if __name__ == "__main__":
    main()
