"""Unicode code-point tokenizer for multilingual from-scratch MelekGPT.

Unlike raw UTF-8 byte sampling, this emits whole Unicode characters, so generated
Arabic, French and Tunisian text cannot break in the middle of a UTF-8 sequence.
"""
UNKNOWN_TOKEN = "<unk>"
TOKENIZER_TYPE = "unicode-char-v1"


def build_tokenizer(documents: list[str]) -> dict:
    characters = sorted({character for document in documents for character in document})
    if not characters:
        raise ValueError("Cannot build a tokenizer from an empty training corpus")
    return {"type": TOKENIZER_TYPE, "itos": [UNKNOWN_TOKEN, *characters]}


def _index(tokenizer: dict) -> dict[str, int]:
    if not isinstance(tokenizer, dict) or tokenizer.get("type") != TOKENIZER_TYPE:
        raise ValueError("Unsupported MelekGPT tokenizer")
    itos = tokenizer.get("itos")
    if not isinstance(itos, list) or len(itos) < 2 or itos[0] != UNKNOWN_TOKEN:
        raise ValueError("Malformed MelekGPT character vocabulary")
    return {character: index for index, character in enumerate(itos) if index > 0}


def encode(text: str, tokenizer: dict) -> list[int]:
    stoi = _index(tokenizer)
    return [stoi.get(character, 0) for character in text]


def decode(token_ids, tokenizer: dict) -> str:
    itos = tokenizer.get("itos") if isinstance(tokenizer, dict) else None
    if not isinstance(itos, list):
        raise ValueError("Malformed MelekGPT character vocabulary")
    output = []
    for token_id in token_ids:
        index = int(token_id)
        output.append(itos[index] if 0 < index < len(itos) else "�")
    return "".join(output)
