import argparse
import json
import math
import sys
from pathlib import Path

import torch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from model.transformer import MelekTransformer


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", required=True)
    parser.add_argument("--data", type=Path)
    args = parser.parse_args()
    device = "cuda" if torch.cuda.is_available() else "cpu"
    saved = torch.load(args.checkpoint, map_location=device, weights_only=True)
    if not saved.get("trained_from_scratch"):
        raise ValueError("refusing to evaluate a checkpoint not marked as trained from scratch")
    if saved.get("training_status") != "trained":
        raise ValueError("refusing to evaluate a partial or training-in-progress checkpoint")
    model = MelekTransformer(**saved["config"]).to(device)
    model.load_state_dict(saved["model"])
    model.eval()
    if not args.data:
        history = saved.get("history", [])
        print(json.dumps({
            "model_id": saved["model_id"],
            "training_status": saved["training_status"],
            "parameter_count": sum(p.numel() for p in model.parameters()),
            "history": history,
            "validation": "not-run-with-heldout-data",
        }, indent=2))
        return
    if args.data.suffix == ".jsonl":
        import json
        rows = [json.loads(line) for line in args.data.read_text(encoding="utf-8").splitlines() if line.strip()]
        text = "\n".join(str(row["text"]) for row in rows)
    else:
        text = args.data.read_text(encoding="utf-8")
    ids = torch.tensor(list(text.encode("utf-8")), dtype=torch.long, device=device)
    context = saved["config"]["context"]
    if len(ids) <= context:
        raise ValueError("evaluation data is too short")
    losses = []
    with torch.no_grad():
        for start in range(0, len(ids) - context, context):
            inputs = ids[start:start + context][None, :]
            targets = ids[start + 1:start + context + 1][None, :]
            if targets.shape[1] != context:
                continue
            _, loss = model(inputs, targets)
            losses.append(loss.item())
    loss = sum(losses) / len(losses)
    print(json.dumps({
        "model_id": saved["model_id"],
        "parameter_count": sum(p.numel() for p in model.parameters()),
        "validation_loss": loss,
        "perplexity": math.exp(min(loss, 20)),
    }, indent=2))


if __name__ == "__main__":
    main()
