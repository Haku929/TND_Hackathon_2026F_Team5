import contextlib
import copy
import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import load_data


def fixture_dataset(root):
    config = {
        "model": "Xenova/multilingual-e5-small",
        "dtype": "q8",
        "dimensions": 384,
        "query_prefix": "query: ",
        "passage_prefix": "passage: ",
    }
    paths = {
        "researchers.json": root / "data" / "researchers.json",
        "fields.yaml": root / "data" / "fields.yaml",
        "researcher_fields.json": root / "data" / "researcher_fields.json",
        "shared/embedding.json": root / "shared" / "embedding.json",
    }
    for name, path in paths.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(config) if name.endswith("embedding.json") else name, encoding="utf-8")
    hashes = {
        name: hashlib.sha256(path.read_bytes()).hexdigest()
        for name, path in paths.items()
    }
    vector = [1.0] + [0.0] * 383
    researcher = {
        "id": "r1", "name": "Name", "affiliation": "Dept", "theme": "theme",
        "kaken_url": "https://example.test/r1", "embedding": vector,
    }
    return {
        "metadata": {
            **config,
            "revision": "a" * 40,
            "max_length": 512,
            "input_sha256": hashes,
            "chunking": {
                "unique_project_count": 1,
                "computed_chunk_count": 1,
                "saved_chunk_count": 1,
                "truncated_input_count": 0,
            },
        },
        "fields": [{
            "id": "field-a", "name": "Field", "summary": "Summary", "misconception": "Myth",
            "embedding": vector,
        }],
        "terms": [{"field_id": "field-a", "term": "term", "description": "desc", "embedding": vector}],
        "researchers": [researcher],
        "researcher_fields": [{"researcher_id": "r1", "field_id": "field-a"}],
        "researcher_chunks": [{
            "researcher_id": "r1", "project_id": "p1", "chunk_index": 0,
            "content": "project", "embedding": vector,
        }],
    }


class FakeCursor:
    def __init__(self, events):
        self.events = events

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def execute(self, query, params=None):
        self.events.append(("execute", query, params))

    def executemany(self, query, params):
        self.events.append(("executemany", query, list(params)))


class FakeConnection:
    def __init__(self):
        self.events = []
        self.commits = 0
        self.rollbacks = 0

    @contextlib.contextmanager
    def transaction(self):
        try:
            yield
        except Exception:
            self.rollbacks += 1
            raise
        else:
            self.commits += 1

    def cursor(self):
        return FakeCursor(self.events)


class LoadDataTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.data = fixture_dataset(self.root)
        self.current = {table: copy.deepcopy(self.data[table]) for table in load_data.TABLES}
        self.exists = {table: True for table in load_data.TABLES}

    def test_database_url_priority_and_quotes(self):
        (self.root / ".env.local").write_text('DATABASE_URL="local-url"\n', encoding="utf-8")
        (self.root / ".env").write_text("DATABASE_URL=base-url\n", encoding="utf-8")
        self.assertEqual(load_data.resolve_database_url({"DATABASE_URL": "env-url"}, self.root), "env-url")
        self.assertEqual(load_data.resolve_database_url({"DATABASE_URL": None}, self.root), "local-url")
        self.assertEqual(load_data.resolve_database_url({"DATABASE_URL": ""}, self.root), "local-url")
        (self.root / ".env.local").unlink()
        self.assertEqual(load_data.resolve_database_url({}, self.root), "base-url")

    def test_cli_output_and_runtime_errors_do_not_show_secret_values(self):
        current = copy.deepcopy(self.current)
        current["fields"].append(current["fields"][0] | {"id": "life-science"})
        plan = load_data.plan_changes(self.data, current)
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            load_data.print_plan(plan, "dry-run")
        message = output.getvalue()
        self.assertNotIn("life-science", message)
        self.assertNotIn("https://", message)
        self.assertEqual(
            load_data._safe_error(RuntimeError("postgres://user:secret@example.test/db")),
            "RuntimeError",
        )

    def test_valid_dataset_and_source_hashes(self):
        self.assertIs(load_data.validate_dataset(self.data, self.root), self.data)
        with self.assertRaisesRegex(load_data.LoadError, "hash does not match"):
            (self.root / "data" / "researchers.json").write_text("changed", encoding="utf-8")
            load_data.validate_dataset(self.data, self.root)

    def test_dataset_rejects_old_output_bad_references_dimensions_and_numeric_fakes(self):
        old_output = copy.deepcopy(self.data)
        del old_output["researcher_chunks"]
        with self.assertRaisesRegex(load_data.LoadError, "five-array chunked"):
            load_data.validate_dataset(old_output, self.root)

        bad_reference = copy.deepcopy(self.data)
        bad_reference["researcher_chunks"][0]["researcher_id"] = "missing"
        with self.assertRaisesRegex(load_data.LoadError, "unknown researcher"):
            load_data.validate_dataset(bad_reference, self.root)

        symbol_chunk = copy.deepcopy(self.data)
        symbol_chunk["researcher_chunks"][0]["content"] = "。"
        with self.assertRaisesRegex(load_data.LoadError, "letter or digit"):
            load_data.validate_dataset(symbol_chunk, self.root)

        for vector in ([1.0] * 383, [0.5] + [0.0] * 383, [float("nan")] + [0.0] * 383,
                       [True] + [0.0] * 383, ["1"] + [0.0] * 383):
            with self.subTest(vector_type=type(vector[0]).__name__, length=len(vector)):
                bad_vector = copy.deepcopy(self.data)
                bad_vector["fields"][0]["embedding"] = vector
                with self.assertRaises(load_data.LoadError):
                    load_data.validate_dataset(bad_vector, self.root)

    def test_plan_finds_obsolete_field_terms_and_relations(self):
        current = copy.deepcopy(self.current)
        current["fields"].append(current["fields"][0] | {"id": "life-science"})
        current["terms"].extend(
            {"id": 10 + index, "field_id": "life-science", "term": f"old-{index}", "description": "old", "embedding": [1.0] + [0.0] * 383}
            for index in range(8)
        )
        current["researcher_fields"].extend(
            {"researcher_id": "r1", "field_id": f"old-field-{index}"} for index in range(3)
        )
        plan = load_data.plan_changes(self.data, current)
        self.assertEqual(len(plan["fields"]["delete"]), 1)
        self.assertEqual(len(plan["terms"]["delete"]), 8)
        self.assertEqual(len(plan["researcher_fields"]["delete"]), 3)

    def test_duplicate_existing_term_keys_are_rejected(self):
        current = copy.deepcopy(self.current)
        current["terms"].append(current["terms"][0] | {"id": 99})
        with self.assertRaisesRegex(load_data.LoadError, "duplicate terms keys"):
            load_data.plan_changes(self.data, current)

    def test_apply_refuses_deletes_before_backup_or_writes(self):
        current = copy.deepcopy(self.current)
        current["fields"].append(current["fields"][0] | {"id": "life-science"})
        connection = FakeConnection()
        with patch.object(load_data, "read_current", return_value=(current, self.exists)), \
             patch.object(load_data, "_backup_current") as backup, \
             patch.object(load_data, "_write_upserts") as upserts:
            with contextlib.redirect_stdout(io.StringIO()):
                with self.assertRaisesRegex(load_data.LoadError, "--apply --prune"):
                    load_data.apply_database(connection, self.data, prune=False)
        backup.assert_not_called()
        upserts.assert_not_called()
        self.assertFalse(connection.events)
        self.assertEqual((connection.commits, connection.rollbacks), (0, 1))

    def test_dry_run_uses_read_only_transaction_and_no_ddl(self):
        connection = FakeConnection()
        with patch.object(load_data, "read_current", return_value=(self.current, self.exists)):
            with contextlib.redirect_stdout(io.StringIO()):
                load_data.dry_run(connection, self.data)
        self.assertEqual(connection.events[0][1], "SET TRANSACTION READ ONLY")
        self.assertFalse(any("CREATE TABLE" in event[1] for event in connection.events))
        self.assertEqual((connection.commits, connection.rollbacks), (1, 0))

    def test_backup_failure_prevents_migration_and_upserts(self):
        connection = FakeConnection()
        with patch.object(load_data, "read_current", return_value=(self.current, self.exists)), \
             patch.object(load_data, "_backup_current", side_effect=OSError), \
             patch.object(load_data, "_write_upserts") as upserts:
            with self.assertRaises(OSError):
                load_data.apply_database(connection, self.data, raw_dir=self.root)
        upserts.assert_not_called()
        self.assertFalse(connection.events)
        self.assertEqual((connection.commits, connection.rollbacks), (0, 1))

    def test_apply_commits_after_backup_sync_and_count_check(self):
        connection = FakeConnection()
        events = []

        def backup(*_args):
            events.append("backup")
            return self.root / "backup.json"

        def upsert(*_args):
            events.append("upsert")

        def verify(*_args):
            events.append("verify")

        with patch.object(load_data, "read_current", return_value=(self.current, self.exists)), \
             patch.object(load_data, "_backup_current", side_effect=backup), \
             patch.object(load_data, "_write_upserts", side_effect=upsert), \
             patch.object(load_data, "_verify_counts", side_effect=verify):
            with contextlib.redirect_stdout(io.StringIO()):
                load_data.apply_database(connection, self.data, raw_dir=self.root)
        self.assertEqual(events, ["backup", "upsert", "verify"])
        self.assertIn("execute", [event[0] for event in connection.events])
        self.assertEqual((connection.commits, connection.rollbacks), (1, 0))

    def test_apply_rolls_back_if_count_verification_fails(self):
        connection = FakeConnection()
        with patch.object(load_data, "read_current", return_value=(self.current, self.exists)), \
             patch.object(load_data, "_backup_current", return_value=self.root / "backup.json"), \
             patch.object(load_data, "_write_upserts"), \
             patch.object(load_data, "_verify_counts", side_effect=load_data.LoadError("count mismatch")):
            with self.assertRaisesRegex(load_data.LoadError, "count mismatch"):
                load_data.apply_database(connection, self.data, raw_dir=self.root)
        self.assertEqual((connection.commits, connection.rollbacks), (0, 1))

    def test_prune_deletes_in_foreign_key_order(self):
        events = []
        cursor = FakeCursor(events)
        plan = {
            table: {"delete": [], "current_by_key": {}}
            for table in load_data.TABLES
        }
        plan["researcher_chunks"]["delete"] = [("old-r", "old-p", 0)]
        plan["researcher_fields"]["delete"] = [("old-r", "old-f")]
        plan["terms"]["delete"] = [("old-f", "old-term")]
        plan["terms"]["current_by_key"] = {("old-f", "old-term"): {"id": 9}}
        plan["researchers"]["delete"] = ["old-r"]
        plan["fields"]["delete"] = ["old-f"]
        load_data._write_deletes(cursor, plan)
        tables = [event[1].split(" FROM ")[1].split(" ")[0] for event in events]
        self.assertEqual(tables, ["researcher_chunks", "researcher_fields", "terms", "researchers", "fields"])

    def test_term_sequence_is_aligned_before_new_term_insert_only(self):
        cursor = FakeCursor([])
        plan = {table: {"current_by_key": {}} for table in load_data.TABLES}
        load_data._write_upserts(cursor, self.data, plan)
        operations = cursor.events
        sequence_index = next(i for i, event in enumerate(operations) if event[0] == "execute" and "setval" in event[1])
        term_insert_index = next(i for i, event in enumerate(operations) if event[0] == "executemany" and event[1] == load_data.UPSERT_SQL["terms_insert"])
        self.assertLess(sequence_index, term_insert_index)

        existing = {
            key: row | {"id": index}
            for index, (key, row) in enumerate(load_data._index_current("terms", self.data["terms"]).items(), 1)
        }
        plan["terms"]["current_by_key"] = existing
        cursor = FakeCursor([])
        load_data._write_upserts(cursor, self.data, plan)
        self.assertFalse(any(event[0] == "execute" and "setval" in event[1] for event in cursor.events))

    def test_backup_has_timestamp_target_embedding_and_all_existing_tables(self):
        backup = load_data._backup_current(self.current, self.exists, self.data["metadata"], self.root)
        saved = json.loads(backup.read_text(encoding="utf-8"))
        self.assertIn("created_at_utc", saved["metadata"])
        self.assertEqual(saved["metadata"]["target_embedding"]["revision"], "a" * 40)
        self.assertEqual(set(saved["tables"]), set(load_data.TABLES))
        self.assertNotIn("DATABASE_URL", json.dumps(saved))


if __name__ == "__main__":
    unittest.main()
