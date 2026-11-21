import unittest
from knowledge import validate

class KnowledgeTests(unittest.TestCase):
    def fact(self):
        return {"id":"project-001","category":"project","text_fr":"Projet public.","text_en":"Public project.","aliases":["demo"],"source":{"file":"index.html","selector":"#projets .project-card"},"approved":False}
    def root(self, facts): return {"schema_version":"1.0","facts":facts}
    def test_valid_fact(self): self.assertEqual(validate(self.root([self.fact()])), [])
    def test_duplicate_ids(self):
        f=self.fact(); self.assertTrue(any("duplicated" in x for x in validate(self.root([f,f.copy()]))))
    def test_missing_source(self):
        f=self.fact(); f["source"]={"file":"index.html"}; self.assertTrue(any("source requires" in x for x in validate(self.root([f]))))
    def test_approval_must_be_boolean(self):
        f=self.fact(); f["approved"]="yes"; self.assertTrue(any("approved must be boolean" in x for x in validate(self.root([f]))))
    def test_only_https_urls(self):
        f=self.fact(); f["url"]="javascript:alert(1)"; self.assertTrue(any("HTTPS" in x for x in validate(self.root([f]))))
    def test_reject_unknown_fields(self):
        f=self.fact(); f["private_note"]="secret"; self.assertTrue(any("unsupported fields" in x for x in validate(self.root([f]))))

if __name__ == "__main__": unittest.main()
