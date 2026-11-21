import argparse
import json
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import torch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from model.transformer import MelekTransformer
from tokenizer.byte_utf8 import decode, encode


def load(checkpoint_path: str, device: str):
    saved = torch.load(checkpoint_path, map_location=device, weights_only=True)
    if not saved.get("trained_from_scratch"):
        raise RuntimeError("refusing to serve a third-party or unmarked checkpoint")
    if saved.get("training_status") != "trained":
        raise RuntimeError("refusing to serve a partial or training-in-progress checkpoint")
    model = MelekTransformer(**saved["config"]).to(device)
    model.load_state_dict(saved["model"])
    model.eval()
    return model, saved


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", required=True)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8091)
    args = parser.parse_args()
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model, saved = load(args.checkpoint, device)

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            if self.path != "/generate":
                self.send_error(404)
                return
            length = int(self.headers.get("Content-Length", "0"))
            try:
                body = json.loads(self.rfile.read(length) or b"{}")
                prompt = str(body.get("prompt", "")).strip()[:800]
                mode = body.get("mode", "chat")
                if mode not in {"chat", "analyze"}:
                    mode = "chat"
                max_tokens = min(512, max(1, int(body.get("max_tokens", 180))))
                if not prompt:
                    raise ValueError("prompt is required")
                system = "In Chat mode, respond concisely." if mode == "chat" else "In Analyze mode, provide structured technical analysis."
                ids = torch.tensor([encode(system + "\n" + prompt)], dtype=torch.long, device=device)
                output = model.generate(ids, max_new_tokens=max_tokens)
                response = {"text": decode(output[0].tolist()), "model_id": saved["model_id"], "trained_from_scratch": True}
                payload = json.dumps(response).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)
            except Exception as exc:
                payload = json.dumps({"error": str(exc)}).encode("utf-8")
                self.send_response(400)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)

        def do_GET(self):
            if self.path != "/status":
                self.send_error(404)
                return
            payload = json.dumps({
                "model_id": saved["model_id"],
                "experimental": True,
                "training_status": saved["training_status"],
                "trained_from_scratch": True,
                "parameter_count": sum(p.numel() for p in model.parameters()),
                "inference_available": True,
            }).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def log_message(self, format, *args):
            return

    print(json.dumps({"listening": f"http://{args.host}:{args.port}", "model_id": saved["model_id"]}))
    HTTPServer((args.host, args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
