import csv
from copy import deepcopy
from pathlib import Path
import tempfile
import unittest

import assign_fields as fields


SMALL = "\u5c0f\u533a\u5206"
MEDIUM = "\u4e2d\u533a\u5206"
BROAD = "\u5927\u533a\u5206"
COMBINED = "\u5408\u540c\u5be9\u67fb\u5bfe\u8c61\u533a\u5206:"


class AssignFieldsTests(unittest.TestCase):
    def setUp(self):
        self.catalog = {"field-a": "Field A", "field-b": "Field B", "field-c": "Field C"}

    def review(self, name, code, table="scheme-x"):
        return {"table_type": table, "code": code, "path": "", "name": name}

    def test_exact_key_keeps_table_type_and_leading_zero_and_blank_code(self):
        rows = [
            ("review_section", "scheme-one", "00123", "", "Small label", "field-a", ""),
            ("review_section", "scheme-two", "00123", "", "Small label", "field-b", ""),
            ("research_field", "saimoku", "", "", "Geography", "field-c", ""),
        ]
        with tempfile.TemporaryDirectory() as directory:
            path = self.write_mapping(Path(directory), rows)
            mapping = fields.load_mapping(path, self.catalog)
        self.assertIn(("review_section", "scheme-one", "00123", "", "Small label"), mapping)
        self.assertIn(("research_field", "saimoku", "", "", "Geography"), mapping)
        self.assertEqual(mapping[("review_section", "scheme-two", "00123", "", "Small label")]["field_ids"], ["field-b"])

    def test_mapped_notes_survive_in_used_and_unused_source_keys(self):
        used = ("review_section", "scheme", "00123", "", "Small label")
        unused = ("research_field", "saimoku", "", "", "Geography")
        rows = [
            used + ("field-a", "Shared note"),
            used + ("field-b", "Shared note"),
            used + ("field-c", "Distinct note"),
            unused + ("field-a", "Unused note A"),
            unused + ("field-b", "Unused note B"),
        ]
        researcher = {
            "id": "r1", "projects": [{"id": "p1", "review_sections": [
                {"table_type": "scheme", "code": "00123", "path": "", "name": "Small label"}
            ]}],
        }
        with tempfile.TemporaryDirectory() as directory:
            mapping = fields.load_mapping(self.write_mapping(Path(directory), rows), self.catalog)
        _, report = fields.build_outputs([researcher], mapping, self.catalog)

        used_source = next(row for row in report["source_keys"] if row["nii_code"] == "00123")
        unused_source = next(row for row in report["unused_mapping_keys"] if row["source_name"] == "Geography")
        self.assertEqual(used_source["mapping_note"], "Shared note\nDistinct note")
        self.assertEqual(unused_source["note"], "Unused note A\nUnused note B")

    def test_real_mapping_keeps_culture_studies_unclassified(self):
        catalog = fields.load_catalog()
        mappings = fields.load_mapping(fields.MAPPING_PATH, catalog)
        culture_keys = [key for key in mappings if key[-1] == "文化学"]

        self.assertTrue(culture_keys)
        self.assertIn("chemistry-materials-nanoscience", catalog)
        for key in culture_keys:
            mapping = mappings[key]
            self.assertNotIn("chemistry-materials-nanoscience", mapping["field_ids"])
            self.assertTrue(mapping["intentionally_unmapped"])
            self.assertTrue(mapping["note"])

    def test_priority_and_combined_source_are_exact_csv_keys(self):
        project = {"review_sections": [
            self.review(BROAD + " general", "01"),
            self.review(MEDIUM + " detail", "0101"),
            self.review(SMALL + " detail", "01010"),
        ], "research_fields": []}
        self.assertEqual([source["name"] for _, source in fields.project_sources(project)], [SMALL + " detail"])
        combined_name = COMBINED + SMALL + " / " + MEDIUM
        combined = {"review_sections": [self.review(combined_name, "05010+05020")], "research_fields": []}
        mappings = {
            ("review_section", "scheme-x", "05010+05020", "", combined_name): {
                "field_ids": ["field-a", "field-b"], "note": "", "intentionally_unmapped": False
            }
        }
        output, _ = fields.build_outputs([{"id": "r1", "projects": [combined]}], mappings, self.catalog)
        self.assertEqual(output["researcher_fields"], [
            {"researcher_id": "r1", "field_id": "field-a"},
            {"researcher_id": "r1", "field_id": "field-b"},
        ])

    def test_old_path_pruning_is_project_and_table_scoped(self):
        parent = {"table_type": "saimoku", "code": "1", "path": "/humanities", "name": "Humanities"}
        child = {"table_type": "saimoku", "code": "2", "path": "/humanities/history", "name": "History"}
        other_table_child = {"table_type": "special", "code": "3", "path": "/humanities/law", "name": "Law"}
        p1 = {"research_fields": [parent, child, other_table_child], "review_sections": []}
        selected = fields.project_sources(p1)
        self.assertEqual({item[1]["name"] for item in selected}, {"History", "Law"})
        p2 = {"research_fields": [parent], "review_sections": []}
        p3 = {"research_fields": [child], "review_sections": []}
        self.assertEqual(fields.project_sources(p2)[0][1]["name"], "Humanities")
        self.assertEqual(fields.project_sources(p3)[0][1]["name"], "History")

    def test_review_sections_prevent_legacy_fallback_even_if_unmapped(self):
        project = {
            "review_sections": [self.review(SMALL + " unknown", "00999")],
            "research_fields": [{"table_type": "saimoku", "code": "1", "path": "/", "name": "legacy"}],
        }
        self.assertEqual([kind for kind, _ in fields.project_sources(project)], ["review_section"])

    def test_mapping_validation_allows_multifield_but_rejects_bad_rows(self):
        key = ("review_section", "scheme", "00123", "", "Small")
        base = key + ("field-a", "")
        rows = [base, key + ("field-b", "")]
        with tempfile.TemporaryDirectory() as directory:
            mapping = fields.load_mapping(self.write_mapping(Path(directory), rows), self.catalog)
            self.assertEqual(mapping[key]["field_ids"], ["field-a", "field-b"])
            invalid_sets = [
                [key + ("unknown-id", "")],
                [base, base],
                [base, key + ("", "intentional blank")],
                [key + ("", "")],
                [("",) + key[1:] + ("field-a", "")],
            ]
            for invalid in invalid_sets:
                path = self.write_mapping(Path(directory), invalid)
                with self.subTest(rows=invalid), self.assertRaises(fields.MappingError):
                    fields.load_mapping(path, self.catalog)

    def test_report_counts_unmapped_sources_and_does_not_mutate_input(self):
        mapped = self.review(SMALL + " known", "00001")
        unknown = self.review(SMALL + " unknown", "00002")
        deliberate = {"table_type": "saimoku", "code": "", "path": "", "name": "Geography"}
        researchers = [
            {"id": "r1", "name": "Researcher 1", "projects": [{"id": "p1", "review_sections": [mapped]}]},
            {"id": "r2", "name": "Researcher 2", "projects": [{"id": "p2", "review_sections": [unknown]}]},
            {"id": "r3", "name": "Researcher 3", "projects": [{"id": "p3", "research_fields": [deliberate]}]},
        ]
        original = deepcopy(researchers)
        mappings = {
            ("review_section", "scheme-x", "00001", "", mapped["name"]): {
                "field_ids": ["field-a"], "note": "", "intentionally_unmapped": False
            },
            ("research_field", "saimoku", "", "", "Geography"): {
                "field_ids": [], "note": "No direct category", "intentionally_unmapped": True
            },
        }
        output, report = fields.build_outputs(researchers, mappings, self.catalog)
        self.assertEqual(researchers, original)
        self.assertEqual(output["researcher_fields"], [{"researcher_id": "r1", "field_id": "field-a"}])
        self.assertEqual(report["summary"]["mapped_researchers"], 1)
        self.assertEqual(report["summary"]["unmatched_source_keys"], 1)
        self.assertEqual(report["summary"]["intentionally_unmapped_source_keys"], 1)
        self.assertEqual({row["status"] for row in report["unmatched_sources"]}, {
            "no_mapping_row", "intentionally_unmapped"
        })
        self.assertEqual([r["researcher_id"] for r in report["unmapped_researchers"]], ["r2", "r3"])

    @staticmethod
    def write_mapping(directory, rows):
        path = directory / "field_map.csv"
        with path.open("w", encoding="utf-8", newline="") as file:
            writer = csv.writer(file)
            writer.writerow(fields.MAPPING_FIELDS)
            writer.writerows(rows)
        return path


if __name__ == "__main__":
    unittest.main()
