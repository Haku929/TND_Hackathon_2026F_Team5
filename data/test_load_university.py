import contextlib
import json
import math
from pathlib import Path
import tempfile
import unittest

import load_university as lu
from load_data import LoadError

CONFIG = {
    "model": "m",
    "dtype": "q8",
    "dimensions": 384,
    "query_prefix": "query: ",
    "passage_prefix": "passage: ",
}


def unit_vector(index=0):
    vector = [0.0] * 384
    vector[index] = 1.0
    return vector


def sample(slug="tsukuba"):
    return {
        "metadata": dict(CONFIG),
        "researchers": [
            {
                "id": f"{slug}:1001",
                "name": "山田 太郎",
                "affiliation": "人文社会系 教授",
                "theme": "他者論の研究",
                "kaken_url": "https://nrid.nii.ac.jp/nrid/1000000001001/",
                "university_id": slug,
                "embedding": unit_vector(0),
            }
        ],
        "researcher_fields": [{"researcher_id": f"{slug}:1001", "field_id": "philosophy-ethics"}],
        "researcher_chunks": [
            {
                "researcher_id": f"{slug}:1001",
                "project_id": "P1",
                "chunk_index": 0,
                "content": "他者論",
                "embedding": unit_vector(1),
            }
        ],
    }


class FakeCursor:
    def __init__(self, script):
        self.script = script
        self.log = []
        self._result = None

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def execute(self, sql, params=None):
        self.log.append(("execute", sql.split()[0] + " " + " ".join(sql.split()[1:4]), params))
        if "information_schema.columns" in sql:
            self._result = [(1,)] if self.script.get("has_column", True) else []
        elif sql.startswith("SELECT id FROM fields"):
            self._result = [(f,) for f in self.script.get("fields", ["philosophy-ethics"])]
        elif "COUNT" in sql.upper() and "researcher_chunks" in sql:
            self._result = [(self.script["chunks"].pop(0),)]
        elif "COUNT" in sql.upper():
            self._result = [(self.script["researchers"].pop(0),)]
        else:
            self._result = None

    def executemany(self, sql, rows):
        self.log.append(("executemany", " ".join(sql.split()[:4]), len(rows)))

    def fetchone(self):
        return self._result[0] if self._result else None

    def fetchall(self):
        return self._result or []


class FakeConnection:
    def __init__(self, script):
        self.cursor_obj = FakeCursor(script)
        self.transactions = 0

    @contextlib.contextmanager
    def transaction(self):
        self.transactions += 1
        yield

    def cursor(self):
        return self.cursor_obj


def write_json(directory, value):
    path = Path(directory) / "embeddings_chunked.json"
    path.write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")
    return path


class LoadFileTests(unittest.TestCase):
    def check(self, mutate, message_part):
        data = sample()
        mutate(data)
        with tempfile.TemporaryDirectory() as directory:
            path = write_json(directory, data)
            with self.assertRaises(LoadError) as context:
                lu.load_file(path, "tsukuba", CONFIG)
        self.assertIn(message_part, str(context.exception))

    def test_accepts_valid_input(self):
        with tempfile.TemporaryDirectory() as directory:
            data = lu.load_file(write_json(directory, sample()), "tsukuba", CONFIG)
        self.assertEqual(len(data["researchers"]), 1)

    def test_reads_gzip_directly(self):
        import gzip

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "embeddings_chunked.json.gz"
            with gzip.open(path, "wt", encoding="utf-8") as file:
                json.dump(sample(), file, ensure_ascii=False)
            data = lu.load_file(path, "tsukuba", CONFIG)
        self.assertEqual(len(data["researchers"]), 1)

    def test_rejects_ritsumei_and_bad_slug(self):
        with tempfile.TemporaryDirectory() as directory:
            path = write_json(directory, sample())
            for slug in ("ritsumei", "Tsukuba", "x-y"):
                with self.assertRaises(LoadError):
                    lu.load_file(path, slug, CONFIG)

    def test_rejects_id_without_prefix(self):
        self.check(lambda d: d["researchers"][0].update(id="1001"), "id must start with")

    def test_rejects_wrong_university(self):
        self.check(lambda d: d["researchers"][0].update(university_id="waseda"), "university_id")

    def test_rejects_unnormalized_embedding(self):
        self.check(lambda d: d["researchers"][0].update(embedding=[0.5] * 384), "L2")

    def test_rejects_wrong_dimension(self):
        self.check(lambda d: d["researcher_chunks"][0].update(embedding=[1.0]), "384")

    def test_rejects_chunk_of_unknown_researcher(self):
        self.check(lambda d: d["researcher_chunks"][0].update(researcher_id="tsukuba:9"), "unknown researcher")

    def test_rejects_model_mismatch(self):
        self.check(lambda d: d["metadata"].update(model="other"), "metadata")

    def test_rejects_duplicate_chunk(self):
        self.check(lambda d: d["researcher_chunks"].append(dict(d["researcher_chunks"][0])), "duplicate chunk")

    def test_vector_literal(self):
        self.assertTrue(lu._vector_literal([1, 0.5]).startswith("[1.0,0.5"))
        self.assertTrue(math.isclose(sum(v * v for v in unit_vector(3)), 1.0))


class RunTests(unittest.TestCase):
    def data(self):
        with tempfile.TemporaryDirectory() as directory:
            return lu.load_file(write_json(directory, sample()), "tsukuba", CONFIG)

    def test_dry_run_does_not_write(self):
        connection = FakeConnection({"researchers": [0], "chunks": [0]})
        summary = lu.run(connection, "tsukuba", self.data(), apply=False)
        kinds = [entry[0] + " " + entry[1] for entry in connection.cursor_obj.log]
        self.assertFalse(summary["applied"])
        self.assertTrue(any("READ ONLY" in k or "SET TRANSACTION" in k for k in kinds))
        self.assertFalse(any(k.startswith("executemany") or "DELETE" in k for k in kinds))

    def test_apply_replaces_only_that_university(self):
        connection = FakeConnection({"researchers": [3, 1], "chunks": [9, 1]})
        summary = lu.run(connection, "tsukuba", self.data(), apply=True)
        log = connection.cursor_obj.log
        deletes = [entry for entry in log if entry[0] == "execute" and entry[1].startswith("DELETE")]
        self.assertEqual(len(deletes), 3)
        for entry in deletes:
            self.assertEqual(entry[2], ("tsukuba",))
        self.assertEqual(summary["verified"], {"researchers": 1, "chunks": 1})
        inserts = [entry for entry in log if entry[0] == "executemany"]
        self.assertEqual(len(inserts), 3)

    def test_count_mismatch_raises_so_transaction_rolls_back(self):
        connection = FakeConnection({"researchers": [0, 5], "chunks": [0, 1]})
        with self.assertRaises(LoadError):
            lu.run(connection, "tsukuba", self.data(), apply=True)

    def test_requires_migration(self):
        connection = FakeConnection({"has_column": False, "researchers": [0], "chunks": [0]})
        with self.assertRaises(LoadError) as context:
            lu.run(connection, "tsukuba", self.data(), apply=False)
        self.assertIn("20261115_add_university.sql", str(context.exception))

    def test_requires_known_fields(self):
        connection = FakeConnection({"fields": ["other"], "researchers": [0], "chunks": [0]})
        with self.assertRaises(LoadError):
            lu.run(connection, "tsukuba", self.data(), apply=False)

    def test_remove_deletes_only_that_university(self):
        connection = FakeConnection({"researchers": [4, 0], "chunks": [7, 0]})
        summary = lu.run(connection, "tsukuba", None, apply=True, remove=True)
        deletes = [e for e in connection.cursor_obj.log if e[0] == "execute" and e[1].startswith("DELETE")]
        self.assertEqual(len(deletes), 3)
        self.assertEqual(summary["after"], {"researchers": 0, "chunks": 0})


if __name__ == "__main__":
    unittest.main()
