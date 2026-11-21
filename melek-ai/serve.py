"""Private, local inference bridge for a trained MelekGPT checkpoint.

Run behind a private Cloudflare Tunnel. Never expose this server directly to the public
Internet: every POST requires MELEK_AI_TOKEN.
"""
import hmac
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import torch
from model import MelekGPT
from tokenizer import TOKENIZER_TYPE, decode, encode

CHECKPOINT = Path(os.environ.get("MELEK_AI_CHECKPOINT", "checkpoints/melek-ai.pt"))
TOKEN = os.environ.get("MELEK_AI_TOKEN", "")
HOST = os.environ.get("MELEK_AI_HOST", "127.0.0.1")
PORT = int(os.environ.get("MELEK_AI_PORT", "8788"))
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

if not TOKEN:
    raise SystemExit("Set MELEK_AI_TOKEN to a long random secret before starting the server.")
if not CHECKPOINT.is_file():
    raise SystemExit(f"Checkpoint not found: {CHECKPOINT}. Train MelekGPT first.")

saved = torch.load(CHECKPOINT, map_location=DEVICE, weights_only=True)
if saved.get("vocab") != TOKENIZER_TYPE or not saved.get("trained_from_scratch"):
    raise SystemExit("Unsupported or unverified MelekGPT checkpoint.")
tokenizer = saved.get("tokenizer")
if not isinstance(tokenizer, dict) or tokenizer.get("type") != TOKENIZER_TYPE:
    raise SystemExit("Checkpoint is missing its Unicode-character tokenizer.")
model = MelekGPT(**saved["config"]).to(DEVICE)
model.load_state_dict(saved["model"])
model.eval()


def format_messages(messages):
    parts = []
    for item in messages[-8:]:
        if not isinstance(item, dict) or item.get("role") not in {"system", "user", "assistant"}:
            continue
        content = item.get("content")
        if isinstance(content, str) and content.strip():
            parts.append(f'{item["role"].capitalize()}: {content[:1800]}')
    parts.append("Assistant:")
    return "\n\n".join(parts)


class Handler(BaseHTTPRequestHandler):
    def send_json(self, status, data):
        payload = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        if self.path == "/health":
            self.send_json(200, {"ok": True, "model": "MelekGPT", "checkpoint_loaded": True, "device": DEVICE})
        else:
            self.send_json(404, {"error": "Not found"})

    def do_POST(self):
        if self.path != "/v1/chat/completions":
            self.send_json(404, {"error": "Not found"})
            return
        supplied = self.headers.get("Authorization", "")
        expected = "Bearer " + TOKEN
        if not hmac.compare_digest(supplied, expected):
            self.send_json(401, {"error": "Unauthorized"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length < 1 or length > 32000:
                raise ValueError("Request body must be between 1 and 32000 bytes.")
            body = json.loads(self.rfile.read(length))
            prompt = format_messages(body.get("messages", []))
            if not prompt:
                raise ValueError("At least one text message is required.")
            max_new = min(256, max(16, int(body.get("max_new_tokens", 160))))
            encoded = torch.tensor(encode(prompt, tokenizer), dtype=torch.long, device=DEVICE)[None, :]
            with torch.inference_mode():
                generated = model.generate(encoded, max_new_tokens=max_new, temperature=0.75, top_k=40)
            answer = decode(generated[0, encoded.shape[1]:].tolist(), tokenizer).strip()
            if not answer:
                raise RuntimeError("The checkpoint generated an empty response.")
            self.send_json(200, {"choices": [{"message": {"role": "assistant", "content": answer}}]})
        except (ValueError, TypeError, json.JSONDecodeError) as exc:
            self.send_json(400, {"error": str(exc)})
        except Exception:
            self.send_json(500, {"error": "MelekGPT inference failed."})

    def log_message(self, fmt, *args):
        print("MelekGPT:", fmt % args)


if __name__ == "__main__":
    print(f"MelekGPT checkpoint loaded on {DEVICE}; listening on http://{HOST}:{PORT}")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
