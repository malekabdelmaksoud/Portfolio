# Dataset

Only add text with a documented, legally usable license.

The included `sample.jsonl` is not meaningful training data. It is only a format and license-validation example.

The generated `owner-corpus/train.jsonl` and `owner-corpus/validation.jsonl` contain only trilingual statements from `melek-ai/knowledge_base.json`, which was extracted from the owner-controlled public portfolio repository. License basis: `owned/public portfolio content`. This dataset contains no third-party downloaded text, private conversations or credentials.

Run:

```bash
python dataset/prepare.py --source ../melek-ai/knowledge_base.json --out dataset/owner-corpus --seed 42 --val-fraction 0.15
```

Required fields:

- `text`: non-empty source text
- `source`: provenance identifier
- `license`: `owned`, `permitted`, or `public-domain`
