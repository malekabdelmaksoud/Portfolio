"""Sample experimental text from a locally trained MelekGPT checkpoint."""
import argparse
import torch

from model import MelekGPT
from tokenizer import TOKENIZER_TYPE, decode, encode


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", required=True)
    parser.add_argument("--prompt", default="Bonjour")
    parser.add_argument("--tokens", type=int, default=160, help="Number of Unicode characters to generate")
    args = parser.parse_args()

    device = "cuda" if torch.cuda.is_available() else "cpu"
    saved = torch.load(args.checkpoint, map_location=device, weights_only=True)
    if saved.get("vocab") != TOKENIZER_TYPE:
        raise ValueError("Unsupported MelekGPT tokenizer")
    model = MelekGPT(**saved["config"]).to(device)
    model.load_state_dict(saved["model"])
    prompt = torch.tensor(encode(args.prompt, saved["tokenizer"]), dtype=torch.long, device=device)[None, :]
    output = model.generate(prompt, max_new_tokens=args.tokens)
    print(decode(output[0].tolist(), saved["tokenizer"]))


if __name__ == "__main__":
    main()
