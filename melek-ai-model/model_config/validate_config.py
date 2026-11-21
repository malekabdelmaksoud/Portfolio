import json
from pathlib import Path

REQUIRED = {
    "model_id", "architecture", "trained_from_scratch", "training_status",
    "vocab_size", "tokenizer", "width", "heads", "layers", "context",
    "dropout", "seed", "batch_size", "gradient_accumulation",
    "learning_rate", "steps", "license", "checkpoint"
}


def validate_config(config: dict) -> list[str]:
    errors = []
    missing = REQUIRED - set(config)
    if missing:
        errors.append("missing: " + ", ".join(sorted(missing)))
    if config.get("architecture") != "decoder-only-causal-transformer":
        errors.append("unsupported architecture")
    if config.get("vocab_size") != 256:
        errors.append("vocab_size must be 256")
    if config.get("tokenizer") != "utf8-byte-v1":
        errors.append("unsupported tokenizer")
    for key in ("width", "heads", "layers", "context", "batch_size", "gradient_accumulation", "steps"):
        if not isinstance(config.get(key), int) or config[key] <= 0:
            errors.append(f"{key} must be a positive integer")
    if isinstance(config.get("width"), int) and isinstance(config.get("heads"), int):
        if config["width"] % config["heads"]:
            errors.append("width must be divisible by heads")
    if not isinstance(config.get("dropout"), (int, float)) or not 0 <= config["dropout"] < 1:
        errors.append("dropout must be in [0, 1)")
    if not isinstance(config.get("learning_rate"), (int, float)) or config["learning_rate"] <= 0:
        errors.append("learning_rate must be positive")
    if not isinstance(config.get("trained_from_scratch"), bool):
        errors.append("trained_from_scratch must be boolean")
    if config.get("training_status") not in {"untrained", "training", "trained", "failed"}:
        errors.append("unsupported training status")
    return errors


def load_config(path: str | Path) -> dict:
    config = json.loads(Path(path).read_text(encoding="utf-8"))
    errors = validate_config(config)
    if errors:
        raise ValueError("; ".join(errors))
    return config
