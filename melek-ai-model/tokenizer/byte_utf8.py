"""Dependency-free UTF-8 byte tokenizer for Melek AI."""

VOCAB_SIZE = 256
TOKENIZER_ID = "utf8-byte-v1"


def encode(text: str) -> list[int]:
    if not isinstance(text, str):
        raise TypeError("text must be a string")
    return list(text.encode("utf-8"))


def decode(token_ids: list[int]) -> str:
    if not isinstance(token_ids, list):
        raise TypeError("token_ids must be a list")
    if any(not isinstance(value, int) or value < 0 or value >= VOCAB_SIZE for value in token_ids):
        raise ValueError("token_ids contains an invalid UTF-8 byte")
    return bytes(token_ids).decode("utf-8", errors="replace")
