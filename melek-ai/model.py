"""A tiny decoder-only Transformer initialized from scratch.

Byte IDs make the prototype Unicode-safe at the byte-stream level, including Arabic.
This is a learning/research implementation, not a production LLM.
"""
import torch
from torch import nn
from torch.nn import functional as F

VOCAB_SIZE = 256  # UTF-8 byte values


class CausalSelfAttention(nn.Module):
    def __init__(self, width: int, heads: int, dropout: float):
        super().__init__()
        if width % heads:
            raise ValueError("width must be divisible by heads")
        self.heads = heads
        self.key = nn.Linear(width, width, bias=False)
        self.query = nn.Linear(width, width, bias=False)
        self.value = nn.Linear(width, width, bias=False)
        self.proj = nn.Linear(width, width)
        self.dropout = nn.Dropout(dropout)

    def forward(self, x):
        batch, length, width = x.shape
        head_width = width // self.heads
        shape = (batch, length, self.heads, head_width)
        q = self.query(x).view(shape).transpose(1, 2)
        k = self.key(x).view(shape).transpose(1, 2)
        v = self.value(x).view(shape).transpose(1, 2)
        y = F.scaled_dot_product_attention(
            q, k, v, is_causal=True, dropout_p=self.dropout.p if self.training else 0.0
        )
        y = y.transpose(1, 2).contiguous().view(batch, length, width)
        return self.dropout(self.proj(y))


class Block(nn.Module):
    def __init__(self, width: int, heads: int, dropout: float):
        super().__init__()
        self.norm1 = nn.LayerNorm(width)
        self.attn = CausalSelfAttention(width, heads, dropout)
        self.norm2 = nn.LayerNorm(width)
        self.mlp = nn.Sequential(
            nn.Linear(width, 4 * width), nn.GELU(),
            nn.Linear(4 * width, width), nn.Dropout(dropout)
        )

    def forward(self, x):
        x = x + self.attn(self.norm1(x))
        return x + self.mlp(self.norm2(x))


class MelekGPT(nn.Module):
    def __init__(self, width=192, heads=4, layers=4, context=256, dropout=0.1):
        super().__init__()
        self.context = context
        self.token_embedding = nn.Embedding(VOCAB_SIZE, width)
        self.position_embedding = nn.Embedding(context, width)
        self.blocks = nn.Sequential(*[Block(width, heads, dropout) for _ in range(layers)])
        self.final_norm = nn.LayerNorm(width)
        self.lm_head = nn.Linear(width, VOCAB_SIZE, bias=False)
        self.lm_head.weight = self.token_embedding.weight
        self.apply(self._init_weights)

    @staticmethod
    def _init_weights(module):
        if isinstance(module, nn.Linear):
            nn.init.normal_(module.weight, mean=0.0, std=0.02)
            if module.bias is not None:
                nn.init.zeros_(module.bias)
        elif isinstance(module, nn.Embedding):
            nn.init.normal_(module.weight, mean=0.0, std=0.02)

    def forward(self, idx, targets=None):
        batch, length = idx.shape
        if length > self.context:
            raise ValueError(f"sequence length {length} exceeds context {self.context}")
        positions = torch.arange(length, device=idx.device)
        x = self.token_embedding(idx) + self.position_embedding(positions)[None, :, :]
        logits = self.lm_head(self.final_norm(self.blocks(x)))
        loss = None
        if targets is not None:
            loss = F.cross_entropy(logits.reshape(-1, VOCAB_SIZE), targets.reshape(-1))
        return logits, loss

    @torch.no_grad()
    def generate(self, idx, max_new_tokens=120, temperature=0.8, top_k=40):
        self.eval()
        for _ in range(max_new_tokens):
            cropped = idx[:, -self.context:]
            logits, _ = self(cropped)
            logits = logits[:, -1, :] / max(temperature, 1e-5)
            if top_k:
                values, _ = torch.topk(logits, min(top_k, logits.size(-1)))
                logits[logits < values[:, [-1]]] = -float("inf")
            probs = F.softmax(logits, dim=-1)
            next_id = torch.multinomial(probs, num_samples=1)
            idx = torch.cat((idx, next_id), dim=1)
        return idx
