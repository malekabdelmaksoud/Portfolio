# Public training data sources and license policy

The downloader writes a local `data/train.jsonl` file and never commits raw source text to Git.
Every row records the upstream dataset, source identifier, normalized license, and language.
Re-check the upstream dataset cards before every new download.

## Included sources

1. **OpenAssistant Conversations (OASST1)** — https://huggingface.co/datasets/OpenAssistant/oasst1
   - Dataset card declares Apache-2.0; 84,437 training messages from 35 languages.
   - Languages selected: English (`en`), French (`fr`), Arabic (`ar`).
   - Reconstructs one-turn user/assistant pairs using `parent_id` and `message_id`.
   - Uses only reviewed, non-deleted, non-synthetic messages; prefers rank 0 and rejects
     rows marked for spam, PII, hate, sexual content, or inappropriate content. It also
     applies conservative Detoxify thresholds and the downloader's email/phone filter.
   - This is the main source of assistant-style conversation examples.


2. **PleIAs Common Corpus** — https://huggingface.co/datasets/PleIAs/common_corpus
   - Languages selected: English (`en`), French (`fr`), Arabic (`ar`).
   - Fields: `text`, `language`, `license`, `identifier`, `collection`, `creator`.
   - The card describes document-level provenance and uncopyrighted/freely licensed material.
   - Strict allowlist: public domain, CC0-1.0, CC-BY-4.0, MIT, Apache-2.0.
   - CC-BY-NC, CC-BY-ND, unknown licenses, missing identifiers, short/noisy text,
     and records with obvious email/phone patterns are skipped.
   - Bounded streaming sample: default scan limit 150,000 and 1,200 documents per language.

3. **UAE Arabic Legal Text Corpus** —
   https://huggingface.co/datasets/University-of-Dubai/arabic-legal-text
   - Dataset card declares CC-BY-4.0 and describes Arabic UAE laws/decrees.
   - Fields: `text`, `source`, `year`, `category`.
   - Used to improve formal Arabic and cybersecurity/legal vocabulary; it is not
     representative of everyday Arabic conversation.

4. **Tunisian Proverbs with Image Associations** —
   https://huggingface.co/datasets/HabibaAbderrahim/Tunisian-Proverbs-with-Image-Associations-A-Cultural-and-Linguistic-Dataset
   - Dataset card declares CC-BY-4.0; 999 proverb entries.
   - Text fields only: Tunisian proverb/context for Derja and the Arabic explanation for
     formal Arabic. Image prompts and image data are excluded.
   - Image columns are removed before iteration to avoid downloading image binaries. A
     conservative blocklist removes a small set of obvious insults/abusive phrases.
     This is not full human moderation; inspect the generated sample before training.

## Explicit exclusions

- `tunis-ai/tunisian-msa-parallel-corpus`: although its card declares CC-BY-4.0, a
  downloaded preview contained abusive and insulting raw source text. It is excluded
  from training rather than relying on an incomplete automatic moderation list.
- `tunis-ai/tunisian-msa-parallel-corpus-evaluated`: contains the same original raw
  Tunisian source text; quality flags cover translation quality, not safety moderation.
- `Syrinesmati/tunisian-dialect-corpus`: Apache-2.0 is declared, but the corpus merges
  many upstream social-media datasets and warns that sensitive information may remain.
- `linagora/Tunisian_Derja_Dataset` and the unified Derja corpus: CC-BY-SA; excluded
  from this starter mix because ShareAlike implications for model weights need separate review.
- `AzizBelaweid/Tunisian_Language_Dataset`: license metadata has shown conflicting descriptions.
- CC-BY-NC and other non-commercial-only datasets are excluded.
- News corpora with unclear underlying publisher rights are excluded.

## Download and inspect

```bash
pip install -r requirements.txt
python download_data.py --out data/train.jsonl --max-per-language 1200 --max-scan 150000
```

The Common Corpus is very large; the script has a scan cap and may not find every language
in one run. Inspect the language counts, license counts, and sample texts before training.
Do not remove the license allowlist to force more rows. The downloader reports unavailable
sources rather than fabricating replacement text.

## Attribution and obligations

Keep this file and each row's source/license metadata with the experiment. Give attribution
to PleIAs/Common Corpus, University of Dubai Research, and the Tunisian proverb dataset
authors when using their material. CC-BY-4.0 requires appropriate credit and indication of
changes. Review upstream terms and model-weight redistribution obligations before publishing
or commercializing a checkpoint. This engineering filter is not legal advice.
