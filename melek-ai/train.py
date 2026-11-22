"""Train MelekGPT from random initialization on a provenance-checked corpus."""
import argparse
import math
from pathlib import Path

import torch

from dataset import load_documents, split_documents
from model import MelekGPT
from tokenizer import TOKENIZER_TYPE, build_tokenizer, encode


def to_tensor(documents: list[str], tokenizer: dict) -> torch.Tensor:
    text = "\n".join(documents) + "\n"
    return torch.tensor(encode(text, tokenizer), dtype=torch.long)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", type=Path, required=True)
    parser.add_argument("--out", type=Path, default=Path("checkpoints/melek-ai.pt"))
    parser.add_argument("--resume", type=Path, help="Continue from a prior Unicode-character MelekGPT checkpoint")
    parser.add_argument("--steps", type=int, default=2000, help="Additional optimizer steps for this run")
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--context", type=int, default=256)
    parser.add_argument("--width", type=int, default=192)
    parser.add_argument("--heads", type=int, default=4)
    parser.add_argument("--layers", type=int, default=4)
    parser.add_argument("--dropout", type=float, default=0.1)
    parser.add_argument("--lr", type=float, default=3e-4)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    if min(args.steps, args.batch_size, args.context, args.width, args.heads, args.layers) < 1:
        parser.error("steps, batch-size, context, width, heads, and layers must be positive")
    if args.width % args.heads:
        parser.error("width must be divisible by heads")
    if not 0 <= args.dropout < 1:
        parser.error("dropout must be in [0, 1)")

    torch.manual_seed(args.seed)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    documents = load_documents(args.data)
    train_documents, val_documents = split_documents(documents, args.seed)

    saved = None
    if args.resume:
        saved = torch.load(args.resume, map_location=device, weights_only=True)
        if saved.get("vocab") != TOKENIZER_TYPE or not saved.get("trained_from_scratch"):
            raise ValueError("Resume checkpoint is not a verified Unicode-character MelekGPT checkpoint")
        tokenizer = saved.get("tokenizer")
        if not isinstance(tokenizer, dict) or tokenizer.get("type") != TOKENIZER_TYPE:
            raise ValueError("Resume checkpoint has no supported character tokenizer")
    else:
        tokenizer = build_tokenizer(train_documents)

    train_data = to_tensor(train_documents, tokenizer)
    val_data = to_tensor(val_documents, tokenizer)
    if len(train_data) <= args.context + 1 or len(val_data) <= args.context + 1:
        raise ValueError(
            "Training and validation splits must each contain more than context + 1 characters. "
            "Add more permitted documents or reduce --context."
        )

    config = {
        "width": args.width,
        "heads": args.heads,
        "layers": args.layers,
        "context": args.context,
        "dropout": args.dropout,
        "vocab_size": len(tokenizer["itos"]),
    }
    model = MelekGPT(**config).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr)
    previous_steps = 0
    if saved:
        if saved.get("config") != config:
            raise ValueError("Resume checkpoint architecture or vocabulary does not match this training run")
        model.load_state_dict(saved["model"])
        if saved.get("optimizer"):
            optimizer.load_state_dict(saved["optimizer"])
        previous_steps = int(saved.get("training", {}).get("steps_total", saved.get("training", {}).get("steps", 0)))
        print(f"Resuming from {args.resume} after {previous_steps} optimizer steps")

    def batch(source):
        starts = torch.randint(0, len(source) - args.context - 1, (args.batch_size,))
        x = torch.stack([source[i:i + args.context] for i in starts]).to(device)
        y = torch.stack([source[i + 1:i + args.context + 1] for i in starts]).to(device)
        return x, y

    parameter_count = sum(parameter.numel() for parameter in model.parameters())
    print(
        f"device={device}; params={parameter_count:,}; vocab={config['vocab_size']}; "
        f"documents={len(documents)} (train={len(train_documents)}, validation={len(val_documents)}); "
        f"train_characters={len(train_data):,}; validation_characters={len(val_data):,}"
    )
    final_validation_loss = None
    for step in range(1, args.steps + 1):
        model.train()
        x, y = batch(train_data)
        _, loss = model(x, y)
        optimizer.zero_grad(set_to_none=True)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        if step == 1 or step % 100 == 0 or step == args.steps:
            model.eval()
            with torch.no_grad():
                vx, vy = batch(val_data)
                _, val_loss = model(vx, vy)
            final_validation_loss = float(val_loss.item())
            print(
                f"step={previous_steps + step} train_loss={loss.item():.4f} "
                f"val_loss={final_validation_loss:.4f}"
            )

    args.out.parent.mkdir(parents=True, exist_ok=True)
    steps_total = previous_steps + args.steps
    torch.save({
        "model": model.state_dict(),
        "optimizer": optimizer.state_dict(),
        "config": config,
        "tokenizer": tokenizer,
        "vocab": TOKENIZER_TYPE,
        "trained_from_scratch": True,
        "training": {
            "steps": args.steps,
            "steps_total": steps_total,
            "seed": args.seed,
            "documents": len(documents),
            "train_documents": len(train_documents),
            "validation_documents": len(val_documents),
            "train_characters": len(train_data),
            "validation_characters": len(val_data),
            "final_validation_loss": final_validation_loss,
            "final_validation_perplexity": (
                math.exp(min(final_validation_loss, 50))
                if final_validation_loss is not None else None
            ),
        },
    }, args.out)
    print(f"saved={args.out}; steps_total={steps_total}")


if __name__ == "__main__":
    main()
