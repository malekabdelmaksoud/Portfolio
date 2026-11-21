import argparse
import hashlib
import json
import random
import sys
import time
from pathlib import Path

import torch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from dataset.dataset import load_jsonl
from model.transformer import MelekTransformer
from model_config.validate_config import load_config


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", type=Path, default=ROOT / "model_config/melek_ai_v1.json")
    parser.add_argument("--data", type=Path, default=ROOT / "dataset/sample.jsonl")
    parser.add_argument("--out", type=Path, default=ROOT / "checkpoints/melek-ai-v1.pt")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    config = load_config(args.config)
    rows = load_jsonl(args.data)
    corpus_bytes = "\n".join(row["text"] for row in rows).encode("utf-8")
    dataset_hash = hashlib.sha256(corpus_bytes).hexdigest()
    if len(corpus_bytes) <= config["context"] + 1:
        raise ValueError("dataset is too small for the configured context; add legally usable rows")
    if args.dry_run:
        print(json.dumps({
            "dry_run": True,
            "model_id": config["model_id"],
            "architecture": config["architecture"],
            "trained_from_scratch": True,
            "dataset_rows": len(rows),
            "dataset_sha256": dataset_hash,
            "context": config["context"],
        }))
        return

    random.seed(config["seed"])
    torch.manual_seed(config["seed"])
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(config["seed"])
    device = "cuda" if torch.cuda.is_available() else "cpu"
    data = torch.tensor(list(corpus_bytes), dtype=torch.long)
    split = int(len(data) * 0.9)
    train_data, val_data = data[:split], data[split:]
    if len(val_data) <= config["context"] + 1:
        val_data = train_data

    model = MelekTransformer(
        width=config["width"],
        heads=config["heads"],
        layers=config["layers"],
        context=config["context"],
        dropout=config["dropout"],
    ).to(device)

    optimizer = torch.optim.AdamW(model.parameters(), lr=config["learning_rate"])
    use_amp = device == "cuda"
    scaler = torch.amp.GradScaler("cuda", enabled=use_amp)
    started = time.time()

    def batch(source):
        starts = torch.randint(0, len(source) - config["context"] - 1, (config["batch_size"],))
        inputs = torch.stack([source[i:i + config["context"]] for i in starts]).to(device)
        targets = torch.stack([source[i + 1:i + config["context"] + 1] for i in starts]).to(device)
        return inputs, targets

    history = []
    optimizer.zero_grad(set_to_none=True)
    for step in range(1, config["steps"] + 1):
        model.train()
        inputs, targets = batch(train_data)
        with torch.amp.autocast("cuda", enabled=use_amp):
            _, loss = model(inputs, targets)
            loss = loss / config["gradient_accumulation"]
        scaler.scale(loss).backward()
        if step % config["gradient_accumulation"] == 0:
            scaler.unscale_(optimizer)
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            scaler.step(optimizer)
            scaler.update()
            optimizer.zero_grad(set_to_none=True)

        if step == 1 or step % 100 == 0:
            model.eval()
            with torch.no_grad():
                val_inputs, val_targets = batch(val_data)
                _, val_loss = model(val_inputs, val_targets)
            row = {
                "step": step,
                "train_loss": float(loss.item() * config["gradient_accumulation"]),
                "validation_loss": float(val_loss.item()),
            }
            history.append(row)
            print(json.dumps(row), flush=True)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    checkpoint = {
        "model": model.state_dict(),
        "config": {
            "width": config["width"],
            "heads": config["heads"],
            "layers": config["layers"],
            "context": config["context"],
            "dropout": config["dropout"],
        },
        "model_id": config["model_id"],
        "architecture": config["architecture"],
        "trained_from_scratch": True,
        "tokenizer": "utf8-byte-v1",
        "vocab": "utf8-byte-v1",
        "seed": config["seed"],
        "dataset_sha256": dataset_hash,
        "dataset_license_validation": "owned/permitted/public-domain",
        "training_status": "trained",
        "duration_seconds": round(time.time() - started, 3),
        "history": history,
    }
    torch.save(checkpoint, args.out)
    print(json.dumps({"saved": str(args.out), "duration_seconds": checkpoint["duration_seconds"]}))


if __name__ == "__main__":
    main()
