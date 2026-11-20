"""Sample experimental text from a locally trained MelekGPT checkpoint."""
import argparse
import torch

from model import MelekGPT


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", required=True)
    parser.add_argument("--prompt", default="Bonjour")
    parser.add_argument("--tokens", type=int, default=160)
    args = parser.parse_args()

    device = "cuda" if torch.cuda.is_available() else "cpu"
    saved = torch.load(args.checkpoint, map_location=device, weights_only=True)
    config = saved["config"]
    model = MelekGPT(**config).to(device)
    model.load_state_dict(saved["model"])
    prompt = torch.tensor(list(args.prompt.encode("utf-8")), dtype=torch.long, device=device)[None, :]
    output = model.generate(prompt, max_new_tokens=args.tokens)
    print(bytes(output[0].tolist()).decode("utf-8", errors="replace"))


if __name__ == "__main__":
    main()
