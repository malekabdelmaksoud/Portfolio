# Public training data sources and license policy

The downloader writes a local `data/train.jsonl` file and never commits source text to Git.
Every row records its upstream dataset, upstream record identifier, normalized license,
and language. Re-check each upstream dataset card before every new download.

## Included sources

1. **PleIAs Common Corpus** — https://huggingface.co/datasets/PleIAs/common_corpus
   - Languages selected: English (`en`), French (`fr`), Arabic (`ar`).
   - Fields used: `text`, `language`, `license`, `identifier`, `collection`, `creator`.
   - The dataset describes document-level provenance and says it contains uncopyrighted
     or freely licensed material. The downloader applies a strict allowlist only:
     public domain, CC0-1.0, CC-BY-4.0, MIT, Apache-2.0.
   - CC-BY-NC, CC-BY-ND, unknown licenses, missing identifiers, short/noisy text,
     and records with obvious email/phone patterns are skipped.
   - It is a very large streaming dataset. The default scan limit is 150,000 records
     and the default output cap is 1,200 documents per language; this is a bounded
     starter sample, not the whole corpus.

2. **Tunisia.AI Tunisian Arabic ↔ MSA Parallel Corpus** —
   https://huggingface.co/datasets/tunis-ai/tunisian-msa-parallel-corpus
   - Dataset card declares CC-BY-4.0 and describes an early release with 1,000 rows.
   - The downloader keeps only the original Tunisian text (`original_text` or
     `chunk_text`) and does not train on generated translation explanations.
   - This is a small, synthetic/early-stage resource. Review sample quality before
     treating it as representative Tunisian dialect.

## Explicit exclusions

- `Syrinesmati/tunisian-dialect-corpus`: its card declares Apache-2.0, but it is a
  derivative merge of numerous upstream datasets, including social-media material,
  and explicitly warns that personal/sensitive information may remain. It is excluded
  until upstream rights and privacy provenance can be verified row by row.
- `AzizBelaweid/Tunisian_Language_Dataset`: search/index metadata and its README
  have shown conflicting license descriptions. It is excluded pending resolution.
- CC-BY-SA datasets: excluded from this starter training mix because ShareAlike
  obligations need separate review for model-weight redistribution.
- CC-BY-NC / other non-commercial-only datasets: excluded.
- News articles with only a dataset-level license claim but unclear underlying
  publisher rights: excluded.

## Download and inspect

```bash
pip install -r requirements.txt
python download_data.py --out data/train.jsonl --max-per-language 1200 --max-scan 150000
```

Inspect counts and several samples before training. If Common Corpus does not yield all
three requested languages within the scan cap, increase `--max-scan` deliberately.
Do not remove the license allowlist to force more rows. The downloader reports missing
sources rather than fabricating replacement text.

## Attribution and obligations

Keep this file and each row's source/license metadata with the experiment. Give
attribution to PleIAs/Common Corpus and Tunisia.AI when using their data. CC-BY-4.0
requires appropriate credit and indication of changes. Review the upstream legal terms
and the legal status of model weights before public or commercial redistribution.
This engineering allowlist is a conservative filter, not legal advice.
