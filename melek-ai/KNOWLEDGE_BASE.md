# Portfolio knowledge base

This directory contains a **review queue**, not a public runtime data source. Draft facts were extracted from the current public portfolio HTML. All records have `approved: false`; they must not be exposed to visitors until the owner verifies and approves each exact statement.

- `knowledge_base.json`: bilingual French/English facts, search aliases, source file and CSS selector, optional public project URL, approval flag.
- `knowledge_schema.json`: JSON Schema contract.
- `knowledge.py`: dependency-free validator.
- `test_knowledge.py`: tests for duplicate IDs, provenance, approval type, HTTPS URLs, and unknown fields.

## Review workflow

1. Compare every statement with its source element in `index.html`.
2. Correct any outdated or inaccurate wording.
3. Set `approved` to `true` only after explicit owner review.
4. Run `python knowledge.py` and `python -m unittest discover -s . -p "test_*.py"`.
5. A future serving endpoint must filter to approved facts and return only their reviewed text. Never trust free-form model output for facts.

Do not add passwords, tokens, visitor messages, private data, inferred personal information, or unpublished CV content. Source selectors are provenance metadata, not proof that a statement is current.

## Limitation

This knowledge base is not connected to the live website or admin dashboard and is intentionally not auto-approved.
