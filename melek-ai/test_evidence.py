import unittest

from evidence import Fact, answer_from_evidence


class EvidenceGuardTests(unittest.TestCase):
    def test_returns_only_approved_verbatim_fact(self):
        facts = [
            Fact("Melek développe des applications web avec Laravel et PHP.", "skills.md", True),
            Fact("A private unapproved note about another subject.", "private.txt", False),
        ]
        result = answer_from_evidence("Quelles compétences Laravel PHP ?", facts)
        self.assertFalse(result.abstained)
        self.assertEqual(result.answer, facts[0].text)
        self.assertEqual(result.sources, ("skills.md",))

    def test_abstains_when_fact_is_missing(self):
        result = answer_from_evidence(
            "Quel est son salaire et son numéro de passeport ?",
            [Fact("Melek étudie le développement web.", "about.md", True)]
        )
        self.assertTrue(result.abstained)
        self.assertEqual(result.sources, ())

    def test_ignores_unapproved_facts(self):
        result = answer_from_evidence(
            "Où travaille-t-il actuellement ?",
            [Fact("Melek travaille chez Example Corp.", "draft.md", False)]
        )
        self.assertTrue(result.abstained)

    def test_does_not_answer_generic_single_word_overlap(self):
        result = answer_from_evidence(
            "projet",
            [Fact("Un projet Laravel réalisé dans le cadre des études.", "projects.md", True)]
        )
        self.assertTrue(result.abstained)


if __name__ == "__main__":
    unittest.main()
