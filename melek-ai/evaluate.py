"""Evaluate a trained MelekGPT checkpoint on the deterministic held-out documents."""
import argparse
import math
from pathlib import Path

import torch

from dataset import load_documents, split_documents
from model import MelekGPT


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", type=Path, required=True)
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--batch-size", type=int, default=16)
    args = parser.parse_args()

    device = "cuda" if torch.cuda.is_available() else "cpu"
    saved = torch.load(args.checkpoint, map_location=device, weights_only=True)
    if saved.get("vocab") != "utf8-byte-v1" or not saved.get("trained_from_scratch"):
        raise ValueError("Unsupported or unverified MelekGPT checkpoint")
    model = MelekGPT(**saved["config"]).to(device)
    model.load_state_dict(saved["model"])
    model.eval()

    documents = load_documents(args.data)
    _, validation_documents = split_documents(documents, saved.get("training", {}).get("seed", 42))
    validation = torch.tensor(
        list(("\n".join(validation_documents) + "\n").encode("utf-8")),
        dtype=torch.long,
    )
    context = model.context
    if len(validation) <= context + 1:
        raise ValueError("Validation split is too small for this checkpoint context")

    losses = []
    with torch.inference_mode():
        for start in range(0, len(validation) - context - 1, context):
            x = validation[start:start + context][None, :].to(device)
            y = validation[start + 1:start + context + 1][None, :].to(device)
            _, loss = model(x, y)
            losses.append(float(loss.item()))

    mean_loss = sum(losses) / len(losses)
    perplexity = math.exp(min(mean_loss, 50))
    training = saved.get("training", {})
    print(f"checkpoint={args.checkpoint}")
    print(f"device={device}; documents={len(documents)}; validation_documents={len(validation_documents)}")
    print(f"steps_total={training.get('steps_total', training.get('steps', 'unknown'))}")
    print(f"validation_loss={mean_loss:.4f}; byte_perplexity={perplexity:.2f}")


if __name__ == "__main__":
    main()
