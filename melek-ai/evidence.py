"""Strict evidence-only response layer for visitor-facing portfolio facts.

No generative model output is trusted here. Answers are verbatim excerpts from
admin-approved facts. If matching evidence is weak or absent, the assistant abstains.
"""
import re
import unicodedata
from dataclasses import dataclass
from typing import Iterable


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFKD", str(text)).casefold()
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return re.sub(r"[^\w+#.-]+", " ", text, flags=re.UNICODE).strip()


def terms(text: str) -> set[str]:
    return {word for word in normalize(text).split() if len(word) > 1}


@dataclass(frozen=True)
class Fact:
    text: str
    source: str
    approved: bool = False


@dataclass(frozen=True)
class EvidenceAnswer:
    answer: str
    sources: tuple[str, ...]
    abstained: bool


def answer_from_evidence(question: str, facts: Iterable[Fact], threshold: float = 0.18) -> EvidenceAnswer:
    """Return only approved source text; never synthesize missing facts."""
    q_terms = terms(question)
    if not q_terms:
        return EvidenceAnswer("Please ask a specific question.", (), True)

    ranked = []
    for fact in facts:
        if not fact.approved or not fact.text.strip() or not fact.source.strip():
            continue
        f_terms = terms(fact.text)
        if not f_terms:
            continue
        overlap = q_terms & f_terms
        # Require a meaningful overlap, not just one generic shared word.
        score = len(overlap) / max(1, len(q_terms))
        if len(overlap) >= 2 and score >= threshold:
            ranked.append((score, fact))

    ranked.sort(key=lambda item: item[0], reverse=True)
    if not ranked:
        return EvidenceAnswer(
            "This information is not available in the approved portfolio content. Please contact Melek for confirmation.",
            (), True
        )

    selected = ranked[:3]
    excerpts = [fact.text.strip() for _, fact in selected]
    sources = tuple(dict.fromkeys(fact.source for _, fact in selected))
    # Verbatim evidence only: no model-generated factual additions.
    return EvidenceAnswer("\n".join(excerpts), sources, False)
