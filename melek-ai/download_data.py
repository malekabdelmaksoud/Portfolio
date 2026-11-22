"""Fetch a bounded, license-filtered multilingual corpus from public Hugging Face datasets."""
import argparse
import json
import re
import sys
import unicodedata
from pathlib import Path

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
    try:
        from datasets import load_dataset
    except ImportError as exc:
        raise SystemExit('Install the corpus downloader dependency with: pip install -r requirements.txt') from exc
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=Path("data/train.jsonl"))
    parser.add_argument("--max-per-language", type=int, default=1200)
    parser.add_argument("--max-scan", type=int, default=150000)
    parser.add_argument("--skip-common-corpus", action="store_true")
    parser.add_argument("--skip-arabic-legal", action="store_true")
    parser.add_argument("--skip-tunisian-proverbs", action="store_true")
    parser.add_argument("--max-tunisian-scan", type=int, default=30000)
    args = parser.parse_args()
    if args.max_per_language < 1 or args.max_scan < 1 or args.max_tunisian_scan < 1:
        parser.error("--max-per-language and --max-scan must be positive")

    args.out.parent.mkdir(parents=True, exist_ok=True)
    seen = set()
    counts = {"en": 0, "fr": 0, "ar": 0, "aeb": 0}
    sources = []
    common_counts = {"en": 0, "fr": 0, "ar": 0}

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
                    if lang not in {"en", "fr", "ar"} or common_counts[lang] >= min(args.max_per_language, 600):
                        if all(common_counts[key] >= min(args.max_per_language, 600) for key in ("en", "fr", "ar")):
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
                    if append(row.get("text"), source, license_name, lang):
                        common_counts[lang] += 1
                print(f"Common Corpus scanned={min(scanned, args.max_scan)}; counts={counts}")
                sources.append("PleIAs/common_corpus")
            except Exception as exc:
                print(f"WARNING: Common Corpus download stopped: {exc}", file=sys.stderr)


        print("Loading OpenAssistant human-reviewed conversation pairs (Apache-2.0)...")
        try:
            stream = load_dataset("OpenAssistant/oasst1", split="train", streaming=True)
            prompt_messages = {}

            def labels_as_map(value):
                if isinstance(value, dict) and isinstance(value.get("name"), list):
                    return dict(zip(value.get("name", []), value.get("value", [])))
                if isinstance(value, list):
                    return {
                        item.get("name"): item.get("value")
                        for item in value
                        if isinstance(item, dict) and item.get("name")
                    }
                return {}

            def accepted_oasst_message(row):
                if row.get("review_result") is not True or row.get("deleted") is True:
                    return False
                if row.get("synthetic") is True or row.get("rank") not in (None, 0):
                    return False
                labels = labels_as_map(row.get("labels"))
                for key in ("spam", "lang_mismatch", "pii", "not_appropriate", "hate_speech", "sexual_content"):
                    if float(labels.get(key, 0) or 0) > 0:
                        return False
                if float(labels.get("fails_task", 0) or 0) > 0.25:
                    return False
                quality = labels.get("quality")
                if quality is not None and float(quality) < 0.5:
                    return False
                detox = row.get("detoxify") or {}
                thresholds = {
                    "toxicity": 0.20,
                    "severe_toxicity": 0.05,
                    "obscene": 0.05,
                    "identity_attack": 0.05,
                    "insult": 0.10,
                    "threat": 0.05,
                    "sexual_explicit": 0.05,
                }
                for key, limit in thresholds.items():
                    if float(detox.get(key, 0) or 0) > limit:
                        return False
                return True

            pairs_added = 0
            for row in stream:
                language = row.get("lang")
                if language not in {"en", "fr", "ar"} or counts[language] >= args.max_per_language:
                    continue
                if not accepted_oasst_message(row):
                    continue
                message_id = row.get("message_id")
                if row.get("role") == "prompter":
                    if message_id and isinstance(row.get("text"), str):
                        prompt_messages[message_id] = row
                    continue
                if row.get("role") != "assistant":
                    continue
                parent = prompt_messages.get(row.get("parent_id"))
                if not parent or parent.get("lang") != language:
                    continue
                prompt_text = parent.get("text", "")
                answer_text = row.get("text", "")
                conversation = f"User: {prompt_text}\nAssistant: {answer_text}"
                source = (
                    "OpenAssistant/oasst1"
                    f" | message_id={str(message_id)[:80]}"
                    f" | parent_id={str(row.get('parent_id'))[:80]}"
                    f" | language={language}"
                )
                if append(conversation, source, "apache-2.0", language, min_length=120):
                    pairs_added += 1
            print(f"OpenAssistant conversation pairs added={pairs_added}; counts={counts}")
            sources.append("OpenAssistant/oasst1")
        except Exception as exc:
            print(f"WARNING: OpenAssistant conversation corpus unavailable: {exc}", file=sys.stderr)

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
                csv_url = f"https://huggingface.co/datasets/{dataset_name}/resolve/main/dataset.csv"
                stream = load_dataset("csv", data_files=csv_url, split="train", streaming=True)
                for row in stream:
                    if counts["aeb"] >= args.max_per_language:
                        break
                    parts = [row.get("tunisan_proverb"), row.get("context")]
                    text = "\n".join(part.strip() for part in parts if isinstance(part, str) and part.strip())
                    if not safe_tunisian_text(text):
                        continue
                    source = f"{dataset_name} | proverb={str(row.get('tunisan_proverb', 'unknown'))[:300]}"
                    append(text, source, "cc-by-4.0", "aeb", min_length=50)
                    explanation = row.get("proverb_arabic_explaination")
                    if safe_tunisian_text(explanation or ""):
                        append(
                            explanation,
                            f"{dataset_name} | Arabic explanation for={str(row.get('tunisan_proverb', 'unknown'))[:300]}",
                            "cc-by-4.0",
                            "ar",
                            min_length=50,
                        )
                sources.append(dataset_name)
            except Exception as exc:
                print(f"WARNING: Tunisian proverb corpus unavailable: {exc}", file=sys.stderr)





        print("Loading LINAGORA FineWeb2 Tunisian Arabic (ODC-By 1.0; quality-filtered)...")
        try:
            stream = load_dataset("linagora/fineweb2_Tunisian_Arabic", split="train", streaming=True)
            tunisian_added = 0
            scanned = 0
            for row in stream:
                scanned += 1
                if scanned > args.max_tunisian_scan or counts["aeb"] >= args.max_per_language:
                    break
                try:
                    quality = float(row.get("language_score", 0) or 0)
                except (TypeError, ValueError):
                    continue
                if quality < 0.85:
                    continue
                text = row.get("text")
                url = row.get("url")
                record_id = row.get("id")
                if not isinstance(url, str) or not url.startswith("https://"):
                    continue
                source = (
                    "linagora/fineweb2_Tunisian_Arabic"
                    f" | id={str(record_id)[:80]}"
                    f" | url={url[:800]}"
                    f" | date={str(row.get('date', 'unknown'))[:40]}"
                    f" | language_score={quality:.3f}"
                )
                if append(text, source, "odc-by-1.0", "aeb"):
                    tunisian_added += 1
            print(f"FineWeb2 Tunisian scan={min(scanned, args.max_tunisian_scan)}; added={tunisian_added}; counts={counts}")
            sources.append("linagora/fineweb2_Tunisian_Arabic")
        except Exception as exc:
            print(f"WARNING: FineWeb2 Tunisian corpus unavailable: {exc}", file=sys.stderr)


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
