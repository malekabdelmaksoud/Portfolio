"""Original small decoder-only Transformer implementation."""
import torch
from torch import nn
from torch.nn import functional as F

VOCAB_SIZE = 256


class CausalSelfAttention(nn.Module):
    def __init__(self, width: int, heads: int, dropout: float):
        super().__init__()
        if width % heads:
            raise ValueError("width must be divisible by heads")
        self.heads = heads
        self.head_width = width // heads
        self.key = nn.Linear(width, width, bias=False)
        self.query = nn.Linear(width, width, bias=False)
        self.value = nn.Linear(width, width, bias=False)
        self.proj = nn.Linear(width, width)
        self.dropout = nn.Dropout(dropout)

    def forward(self, x):
        batch, length, width = x.shape
        shape = (batch, length, self.heads, self.head_width)
        q = self.query(x).view(shape).transpose(1, 2)
        k = self.key(x).view(shape).transpose(1, 2)
        v = self.value(x).view(shape).transpose(1, 2)
        y = F.scaled_dot_product_attention(
            q, k, v, is_causal=True,
            dropout_p=self.dropout.p if self.training else 0.0
        )
        y = y.transpose(1, 2).contiguous().view(batch, length, width)
        return self.dropout(self.proj(y))


class Block(nn.Module):
    def __init__(self, width: int, heads: int, dropout: float):
        super().__init__()
        self.norm1 = nn.LayerNorm(width)
        self.attention = CausalSelfAttention(width, heads, dropout)
        self.norm2 = nn.LayerNorm(width)
        self.mlp = nn.Sequential(
            nn.Linear(width, 4 * width),
            nn.GELU(),
            nn.Linear(4 * width, width),
            nn.Dropout(dropout),
        )

    def forward(self, x):
        x = x + self.attention(self.norm1(x))
        return x + self.mlp(self.norm2(x))


class MelekTransformer(nn.Module):
    def __init__(self, width=192, heads=4, layers=4, context=256, dropout=0.1):
        super().__init__()
        self.context = context
        self.token_embedding = nn.Embedding(VOCAB_SIZE, width)
        self.position_embedding = nn.Embedding(context, width)
        self.blocks = nn.Sequential(*(Block(width, heads, dropout) for _ in range(layers)))
        self.final_norm = nn.LayerNorm(width)
        self.output = nn.Linear(width, VOCAB_SIZE, bias=False)
        self.output.weight = self.token_embedding.weight
        self.apply(self._initialize)

    @staticmethod
    def _initialize(module):
        if isinstance(module, nn.Linear):
            nn.init.normal_(module.weight, mean=0.0, std=0.02)
            if module.bias is not None:
                nn.init.zeros_(module.bias)
        elif isinstance(module, nn.Embedding):
            nn.init.normal_(module.weight, mean=0.0, std=0.02)

    def forward(self, token_ids, targets=None):
        batch, length = token_ids.shape
        if length > self.context:
            raise ValueError("sequence length exceeds model context")
        positions = torch.arange(length, device=token_ids.device)
        x = self.token_embedding(token_ids) + self.position_embedding(positions)[None, :, :]
        logits = self.output(self.final_norm(self.blocks(x)))
        loss = None
        if targets is not None:
            loss = F.cross_entropy(logits.reshape(-1, VOCAB_SIZE), targets.reshape(-1))
        return logits, loss

    @torch.no_grad()
    def generate(self, token_ids, max_new_tokens=180, temperature=0.8, top_k=40):
        self.eval()
        for _ in range(max_new_tokens):
            cropped = token_ids[:, -self.context:]
            logits, _ = self(cropped)
            logits = logits[:, -1, :] / max(temperature, 1e-5)
            if top_k:
                values, _ = torch.topk(logits, min(top_k, logits.size(-1)))
                logits[logits < values[:, [-1]]] = -float("inf")
            probabilities = F.softmax(logits, dim=-1)
            next_id = torch.multinomial(probabilities, num_samples=1)
            token_ids = torch.cat((token_ids, next_id), dim=1)
        return token_ids
