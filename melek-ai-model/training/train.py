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
    parser.add_argument("--train", type=Path)
    parser.add_argument("--validation", type=Path)
    parser.add_argument("--batch-size", type=int)
    parser.add_argument("--gradient-accumulation", type=int)
    parser.add_argument("--context", type=int)
    parser.add_argument("--steps", type=int)
    parser.add_argument("--learning-rate", type=float)
    parser.add_argument("--resume", type=Path)
    parser.add_argument("--log", type=Path)
    args = parser.parse_args()

    config = load_config(args.config)
    train_path = args.train or args.data
    val_path = args.validation
    train_rows = load_jsonl(train_path)
    val_rows = load_jsonl(val_path) if val_path else train_rows
    corpus_bytes = "\n".join(row["text"] for row in train_rows).encode("utf-8")
    val_bytes = "\n".join(row["text"] for row in val_rows).encode("utf-8")
    dataset_hash = hashlib.sha256(corpus_bytes + b"\0" + val_bytes).hexdigest()
    context = args.context or config["context"]
    if len(corpus_bytes) <= context + 1 or len(val_bytes) <= context + 1:
        raise ValueError("datasets are too small for the configured context")
    if args.dry_run:
        print(json.dumps({
            "dry_run": True,
            "model_id": config["model_id"],
            "architecture": config["architecture"],
            "trained_from_scratch": True,
            "dataset_rows": len(rows),
            "dataset_sha256": dataset_hash,
            "context": context,
            "train_rows": len(train_rows),
            "validation_rows": len(val_rows),
            "dataset_sha256": dataset_hash,
        }))
        return

    random.seed(config["seed"])
    torch.manual_seed(config["seed"])
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(config["seed"])
    device = "cuda" if torch.cuda.is_available() else "cpu"
    train_data = torch.tensor(list(corpus_bytes), dtype=torch.long)
    val_data = torch.tensor(list(val_bytes), dtype=torch.long)
    batch_size = args.batch_size or config["batch_size"]
    accumulation = args.gradient_accumulation or config["gradient_accumulation"]
    steps = args.steps or config["steps"]
    learning_rate = args.learning_rate or config["learning_rate"]

    model = MelekTransformer(
        width=config["width"],
        heads=config["heads"],
        layers=config["layers"],
        context=context,
        dropout=config["dropout"],
    ).to(device)

    start_step = 0
    history = []
    optimizer = torch.optim.AdamW(model.parameters(), lr=learning_rate)
    if args.resume:
        saved = torch.load(args.resume, map_location=device, weights_only=False)
        model.load_state_dict(saved["model"])
        optimizer.load_state_dict(saved["optimizer"])
        start_step = int(saved["step"])
        history = saved.get("history", [])
        print(json.dumps({"resumed": str(args.resume), "step": start_step}))
    use_amp = device == "cuda"
    scaler = torch.amp.GradScaler("cuda", enabled=use_amp)
    started = time.time()

    def batch(source):
        starts = torch.randint(0, len(source) - context - 1, (batch_size,))
        inputs = torch.stack([source[i:i + context] for i in starts]).to(device)
        targets = torch.stack([source[i + 1:i + context + 1] for i in starts]).to(device)
        return inputs, targets

    optimizer.zero_grad(set_to_none=True)
    for step in range(start_step + 1, start_step + steps + 1):
        model.train()
        inputs, targets = batch(train_data)
        with torch.amp.autocast("cuda", enabled=use_amp):
            _, loss = model(inputs, targets)
            loss = loss / accumulation
        scaler.scale(loss).backward()
        if step % accumulation == 0:
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
                "train_loss": float(loss.item() * accumulation),
                "validation_loss": float(val_loss.item()),
            }
            history.append(row)
            print(json.dumps(row), flush=True)
            if args.log:
                args.log.parent.mkdir(parents=True, exist_ok=True)
                args.log.write_text(json.dumps(history, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    args.out.parent.mkdir(parents=True, exist_ok=True)
    checkpoint = {
        "model": model.state_dict(),
        "optimizer": optimizer.state_dict(),
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
        "step": step,
        "optimizer": optimizer.state_dict(),
        "duration_seconds": round(time.time() - started, 3),
        "history": history,
    }
    torch.save(checkpoint, args.out)
    print(json.dumps({"saved": str(args.out), "duration_seconds": checkpoint["duration_seconds"]}))


if __name__ == "__main__":
    main()
