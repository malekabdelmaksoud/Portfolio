"""Strict evidence-only response layer for visitor-facing portfolio facts.

Only admin-approved, sourced facts can be returned, and returned text is verbatim.
This module deliberately abstains when a question is ambiguous or evidence coverage
is weak. It does not call or trust a generative model.
"""
import math
import re
import unicodedata
from dataclasses import dataclass
from typing import Iterable


# Common function words are excluded so they cannot create misleading matches.
_STOP_WORDS = set("""
a an the and or but is are was were be been being to of in on at for from with
about what which who where when why how does do did can could would should i me my
you your he she it we they this that these those please tell give show
le la les un une des du de et ou mais est sont a au aux en dans sur pour par avec
qui que quoi comment quel quelle quels quelles ou quand pourquoi je tu il elle nous
vous ils elles mon ma mes ton ta tes son sa ses ce cet cette ces
que es el los las y o para por con como donde cuando porque sobre
شنو شنية شكون وين وقتاش علاش كيفاش كيف شنوّة نحب نعرف قولي اعطيني وريني هو هي من في على الى إلى عن مع و او أو
""".split())


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


ABSTENTION = (
    "This information is not available in the approved portfolio content. "
    "Please contact Melek for confirmation."
)


def normalize(text: str) -> str:
    """Normalize Unicode and common Arabic letter variants for matching."""
    value = unicodedata.normalize("NFKD", str(text)).casefold()
    value = "".join(
        ch for ch in value
        if not unicodedata.combining(ch) and ch != "\u0640"
    )
    value = value.translate(str.maketrans({
        "أ": "ا", "إ": "ا", "آ": "ا", "ى": "ي", "ؤ": "و", "ئ": "ي",
    }))
    return re.sub(r"[^\w+#]+", " ", value, flags=re.UNICODE).strip()


def terms(text: str) -> set[str]:
    return {
        token for token in normalize(text).split()
        if len(token) > 1 and token not in _STOP_WORDS
    }


def answer_from_evidence(
    question: str,
    facts: Iterable[Fact],
    threshold: float = 0.50,
    max_facts: int = 3,
) -> EvidenceAnswer:
    """Return approved source text only; abstain if query coverage is insufficient."""
    query_terms = terms(question)
    if not query_terms:
        return EvidenceAnswer("Please ask a specific question.", (), True)

    approved_facts = []
    for fact in facts:
        if not isinstance(fact, Fact):
            continue
        if not fact.approved or not fact.text.strip() or not fact.source.strip():
            continue
        fact_terms = terms(fact.text)
        if fact_terms:
            approved_facts.append((fact, fact_terms))

    if not approved_facts:
        return EvidenceAnswer(ABSTENTION, (), True)

    # Inverse document frequency reduces the influence of words appearing in
    # almost every portfolio fact (for example, "web" or "project").
    doc_count = len(approved_facts)
    document_frequency = {
        term: sum(term in fact_terms for _, fact_terms in approved_facts)
        for term in query_terms
    }
    weights = {
        term: math.log(1 + doc_count / (1 + document_frequency[term]))
        for term in query_terms
    }
    total_weight = sum(weights.values()) or 1.0

    ranked = []
    for fact, fact_terms in approved_facts:
        matched = query_terms & fact_terms
        if not matched:
            continue
        coverage = sum(weights[token] for token in matched) / total_weight
        # A single meaningful query term is acceptable; generic words were
        # removed above. Multi-term questions need strong coverage.
        if coverage >= threshold:
            ranked.append((coverage, fact))

    ranked.sort(key=lambda item: item[0], reverse=True)
    if not ranked:
        return EvidenceAnswer(ABSTENTION, (), True)

    selected_texts = []
    selected_sources = []
    for _, fact in ranked:
        text = fact.text.strip()
        if text not in selected_texts:
            selected_texts.append(text)
            selected_sources.append(fact.source)
        if len(selected_texts) >= max(1, max_facts):
            break

    return EvidenceAnswer(
        "\n".join(selected_texts),
        tuple(dict.fromkeys(selected_sources)),
        False,
    )
