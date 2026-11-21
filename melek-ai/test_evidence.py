import unittest

from evidence import Fact, answer_from_evidence, normalize, terms


class EvidenceGuardTests(unittest.TestCase):
    def test_returns_only_approved_verbatim_fact(self):
        fact = Fact("Melek développe des applications web avec Laravel et PHP.", "skills.md", True)
        result = answer_from_evidence(
            "Quelles compétences Laravel PHP ?", [fact]
        )
        self.assertFalse(result.abstained)
        self.assertEqual(result.answer, fact.text)
        self.assertEqual(result.sources, ("skills.md",))

    def test_abstains_when_fact_is_missing(self):
        result = answer_from_evidence(
            "Quel est son salaire et son numéro de passeport ?",
            [Fact("Melek étudie le développement web.", "about.md", True)],
        )
        self.assertTrue(result.abstained)
        self.assertEqual(result.sources, ())

    def test_ignores_unapproved_facts(self):
        result = answer_from_evidence(
            "Où travaille-t-il actuellement ?",
            [Fact("Melek travaille chez Example Corp.", "draft.md", False)],
        )
        self.assertTrue(result.abstained)

    def test_does_not_answer_from_generic_words(self):
        result = answer_from_evidence(
            "projet",
            [Fact("Un projet Laravel réalisé dans le cadre des études.", "projects.md", True)],
        )
        self.assertTrue(result.abstained)

    def test_arabic_diacritics_and_alef_variants_normalize(self):
        self.assertEqual(normalize("إِبْرَاهِيم"), normalize("ابراهيم"))

    def test_arabic_question_matches_approved_arabic_fact(self):
        fact = Fact("المهارات: تطوير الويب باستعمال Laravel و PHP", "skills.md", True)
        result = answer_from_evidence("شنوّة مهارات Laravel و PHP؟", [fact])
        self.assertFalse(result.abstained)
        self.assertEqual(result.answer, fact.text)

    def test_french_stop_words_do_not_count_as_evidence(self):
        result = answer_from_evidence(
            "qui est le et la",
            [Fact("Le portfolio présente des projets Laravel.", "projects.md", True)],
        )
        self.assertTrue(result.abstained)

    def test_requires_coverage_of_multi_concept_question(self):
        result = answer_from_evidence(
            "Laravel Python cybersécurité",
            [Fact("Compétences en Laravel et PHP.", "skills.md", True)],
        )
        self.assertTrue(result.abstained)

    def test_missing_source_is_not_approved_evidence(self):
        result = answer_from_evidence(
            "Laravel PHP",
            [Fact("Laravel et PHP", "   ", True)],
        )
        self.assertTrue(result.abstained)

    def test_single_specific_term_can_match(self):
        fact = Fact("Le projet utilise Laravel.", "project.md", True)
        result = answer_from_evidence("Laravel", [fact])
        self.assertFalse(result.abstained)
        self.assertEqual(result.answer, fact.text)


if __name__ == "__main__":
    unittest.main()
