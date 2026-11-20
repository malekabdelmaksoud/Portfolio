"""Train MelekGPT from random initialization on an owner-provided JSONL corpus."""
import argparse
import json
import random
from pathlib import Path

import torch

from model import MelekGPT


def load_bytes(path: Path) -> torch.Tensor:
    chunks = []
    with path.open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, 1):
            if not line.strip():
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError as exc:
                raise ValueError(f"Invalid JSON on line {line_number}") from exc
            text = row.get("text")
            if not isinstance(text, str) or not text.strip():
                continue
            if row.get("license") not in {"owned", "permitted", "public-domain"}:
                raise ValueError(f"Line {line_number} needs an allowed license field")
            chunks.append(text.encode("utf-8") + b"\\n")
    if not chunks:
        raise ValueError("Training corpus is empty")
    return torch.tensor(list(b"".join(chunks)), dtype=torch.long)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", type=Path, required=True)
    parser.add_argument("--out", type=Path, default=Path("checkpoints/melek-ai.pt"))
    parser.add_argument("--steps", type=int, default=2000)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--context", type=int, default=256)
    parser.add_argument("--width", type=int, default=192)
    parser.add_argument("--heads", type=int, default=4)
    parser.add_argument("--layers", type=int, default=4)
    parser.add_argument("--lr", type=float, default=3e-4)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    random.seed(args.seed)
    torch.manual_seed(args.seed)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    data = load_bytes(args.data)
    if len(data) <= args.context + 1:
        raise ValueError("Corpus is too small: add more permitted text before training")
    split = int(len(data) * 0.9)
    train_data, val_data = data[:split], data[split:]
    if len(val_data) <= args.context + 1:
        val_data = train_data

    def batch(source):
        starts = torch.randint(0, len(source) - args.context - 1, (args.batch_size,))
        x = torch.stack([source[i:i + args.context] for i in starts]).to(device)
        y = torch.stack([source[i + 1:i + args.context + 1] for i in starts]).to(device)
        return x, y

    model = MelekGPT(args.width, args.heads, args.layers, args.context).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr)
    print(f"device={device}; params={sum(p.numel() for p in model.parameters()):,}; bytes={len(data):,}")
    for step in range(1, args.steps + 1):
        model.train()
        x, y = batch(train_data)
        _, loss = model(x, y)
        optimizer.zero_grad(set_to_none=True)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        if step == 1 or step % 100 == 0:
            model.eval()
            with torch.no_grad():
                vx, vy = batch(val_data)
                _, val_loss = model(vx, vy)
            print(f"step={step} train_loss={loss.item():.4f} val_loss={val_loss.item():.4f}")
    args.out.parent.mkdir(parents=True, exist_ok=True)
    torch.save({
        "model": model.state_dict(),
        "config": {"width": args.width, "heads": args.heads, "layers": args.layers, "context": args.context},
        "vocab": "utf8-byte-v1",
        "trained_from_scratch": True,
    }, args.out)
    print(f"saved={args.out}")


if __name__ == "__main__":
    main()
