import argparse
import sys
from pathlib import Path

import torch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from model.transformer import MelekTransformer
from tokenizer.byte_utf8 import decode, encode


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", required=True)
    parser.add_argument("--prompt", default="Bonjour")
    parser.add_argument("--tokens", type=int, default=120)
    parser.add_argument("--temperature", type=float, default=0.8)
    args = parser.parse_args()
    device = "cuda" if torch.cuda.is_available() else "cpu"
    saved = torch.load(args.checkpoint, map_location=device, weights_only=True)
    if saved.get("trained_from_scratch") is not True:
        raise SystemExit("refusing to generate from an untrained or unmarked checkpoint")
    model = MelekTransformer(**saved["config"]).to(device)
    model.load_state_dict(saved["model"])
    ids = torch.tensor([encode(args.prompt)], dtype=torch.long, device=device)
    output = model.generate(ids, max_new_tokens=args.tokens, temperature=args.temperature)
    print(decode(output[0].tolist()))


if __name__ == "__main__":
    main()
