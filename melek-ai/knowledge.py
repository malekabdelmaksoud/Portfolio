"""Dependency-free validation for the portfolio knowledge base."""
import json, re
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
ID = re.compile(r"^[a-z0-9]+-[0-9]{3}$")
CATEGORIES = {"profile", "contact", "education", "skills", "experience", "project", "languages", "certifications", "achievements"}
REQUIRED = {"id", "category", "text_fr", "text_en", "text_ar", "aliases", "source", "approved"}

def validate(data):
    errors = []
    if not isinstance(data, dict) or data.get("schema_version") != "1.0":
        return ["root must be an object with schema_version 1.0"]
    facts = data.get("facts")
    if not isinstance(facts, list):
        return ["facts must be an array"]
    seen = set()
    for i, fact in enumerate(facts):
        p = f"facts[{i}]"
        if not isinstance(fact, dict):
            errors.append(f"{p} must be an object"); continue
        missing = REQUIRED - fact.keys()
        if missing:
            errors.append(f"{p} missing: {', '.join(sorted(missing))}"); continue
        if not isinstance(fact["id"], str) or not ID.fullmatch(fact["id"]):
            errors.append(f"{p}.id has invalid format")
        elif fact["id"] in seen:
            errors.append(f"{p}.id is duplicated")
        seen.add(fact["id"])
        if fact["category"] not in CATEGORIES: errors.append(f"{p}.category is unsupported")
        for key in ("text_fr", "text_en"):
            if not isinstance(fact[key], str) or not fact[key].strip(): errors.append(f"{p}.{key} must be non-empty")
        if not isinstance(fact["aliases"], list) or any(not isinstance(x, str) for x in fact["aliases"]):
            errors.append(f"{p}.aliases must be strings")
        source = fact["source"]
        if not isinstance(source, dict) or not all(isinstance(source.get(k), str) and source[k].strip() for k in ("file", "selector")):
            errors.append(f"{p}.source requires file and selector")
        if not isinstance(fact["approved"], bool): errors.append(f"{p}.approved must be boolean")
        if set(fact) - (REQUIRED | {"url"}): errors.append(f"{p} contains unsupported fields")
        if "url" in fact:
            u = urlparse(fact["url"]) if isinstance(fact["url"], str) else None
            if not u or u.scheme != "https" or not u.netloc: errors.append(f"{p}.url must be HTTPS")
    return errors

def main():
    try: data = json.loads((ROOT / "knowledge_base.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc: raise SystemExit(f"Cannot read knowledge base: {exc}")
    errors = validate(data)
    if errors: raise SystemExit("\n".join(errors))
    print(f"Knowledge base valid: {len(data['facts'])} draft facts; approval flags preserved.")

if __name__ == "__main__": main()
