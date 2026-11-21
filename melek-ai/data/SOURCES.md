# Public training data sources and license policy

The downloader writes a local `data/train.jsonl` file and never commits raw source text to Git. Every row records the upstream dataset, source identifier, normalized license, and language. Re-check upstream dataset cards before every new download.

## Included sources

1. **PleIAs Common Corpus** — https://huggingface.co/datasets/PleIAs/common_corpus
   - A large multilingual corpus containing books, public records, legal/scientific material and cultural heritage documents.
   - The dataset card states that source documents are uncopyrighted or freely licensed and that document-level provenance is available.
   - The downloader samples English, French and Arabic, but only accepts rows with explicit identifiers and a narrow permissive allowlist: public domain, CC0-1.0, CC-BY-4.0, MIT or Apache-2.0.
   - CC-BY-NC, CC-BY-ND, unknown licenses, missing identifiers, short/noisy text and obvious email/phone patterns are skipped.
   - The sample is bounded; it is not a full download of the multi-terabyte corpus.

2. **OpenAssistant Conversations (OASST1)** — https://huggingface.co/datasets/OpenAssistant/oasst1
   - Dataset card declares Apache-2.0 and describes human-generated, human-annotated conversations in 35 languages.
   - The downloader selects English, French and Arabic user/assistant pairs using parent/message IDs.
   - It keeps only reviewed, non-deleted, non-synthetic messages, rejects messages flagged for spam, PII, hate, sexual content or inappropriateness, and applies conservative Detoxify thresholds and email/phone filtering.
   - Dataset attribution and license notice must be retained.

3. **UAE Arabic Legal Text Corpus** — https://huggingface.co/datasets/University-of-Dubai/arabic-legal-text
   - Dataset card declares CC-BY-4.0 and identifies the University of Dubai Research team as maintainer.
   - Provides Arabic legal provisions and metadata. The current public release is very small (two rows), so it is only a domain supplement.
   - The downloader preserves law/category/year metadata in the source field.

4. **Tunisian Proverbs with Image Associations** — https://huggingface.co/datasets/HabibaAbderrahim/Tunisian-Proverbs-with-Image-Associations-A-Cultural-and-Linguistic-Dataset
   - Dataset card declares CC-BY-4.0 and describes 999 Tunisian proverb records.
   - Only text fields are used: Tunisian proverb, context and Arabic explanation. Image prompts and binary images are excluded.
   - A small conservative blocklist filters known abusive phrases; this is not complete human moderation. Review samples before training.
   - Cite Habiba Abderrahim, Hedi Ayadi and Fadoua Ouamani, DOI: 10.57967/hf/5189.

5. **FineWeb2 Tunisian Arabic (LINAGORA)** — https://huggingface.co/datasets/linagora/fineweb2_Tunisian_Arabic
   - Dataset card declares Open Data Commons Attribution (ODC-By) 1.0 and identifies 265,217 Tunisian Arabic (`aeb`) rows.
   - The downloader uses only text rows with `language_score >= 0.85`, requires an HTTPS source URL, keeps the source URL, record ID and date, and filters obvious email/phone patterns.
   - The corpus originates from Common Crawl; Common Crawl terms and ODC-By attribution obligations must be retained. Quality filtering is automatic and does not guarantee absence of personal or harmful content.

6. **Tunisian Chatbot Instruction Data** — https://huggingface.co/datasets/abdouuu/tunisian_chatbot_data
   - A small Tunisian Derja instruction/response dataset listed in public Tunisian NLP resource collections.
   - Its license and source provenance must be verified from the live dataset card before use. It is therefore **not included in the automatic training downloader** until that verification is available.

## Explicit exclusions

- Tunisian Derja aggregations tagged CC-BY-SA are excluded from this starter mix because ShareAlike implications for model weights need separate review.
- Datasets with conflicting license metadata, unknown publisher rights, non-commercial-only restrictions, or unreviewed social-media personal data are excluded.
- Raw Tunisian social-media corpora are not treated as automatically safe just because they are publicly downloadable.
- The Tunisian Chatbot dataset is not automatically ingested until its license and provenance are verified.
- CC-BY-NC and other non-commercial-only datasets are excluded from this permissive-license mix.

## Download and inspect

```bash
pip install -r requirements.txt
python download_data.py --out data/train.jsonl --max-per-language 1200 --max-scan 150000
```

The Common Corpus is very large; the script has a scan cap and may not find every language in one run. Inspect language counts, license counts, and samples before training. Do not remove the license allowlist to force more rows. The downloader reports unavailable sources rather than fabricating replacement text.

## Attribution and obligations

Keep this file and each row's source/license metadata with the experiment. Give attribution to PleIAs/Common Corpus, OpenAssistant contributors, University of Dubai Research, and the Tunisian proverb dataset authors when using their material. CC-BY-4.0 requires appropriate credit and indication of changes. Review upstream terms and model-weight redistribution obligations before publishing or commercializing a checkpoint. This engineering filter is not legal advice.
