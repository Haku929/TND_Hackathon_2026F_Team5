"""Plan or transactionally sync the prepared embeddings into PostgreSQL."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import re
import tempfile


ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data" / "raw"
MIGRATION_PATH = ROOT / "db" / "migrations" / "20261111_add_researcher_chunks.sql"
TABLES = ("fields", "terms", "researchers", "researcher_fields", "researcher_chunks")
CORE_TABLES = TABLES[:-1]
COLUMNS = {
    "fields": ("id", "name", "summary", "misconception", "embedding"),
    "terms": ("id", "field_id", "term", "description", "embedding"),
    "researchers": ("id", "name", "affiliation", "theme", "kaken_url", "embedding"),
    "researcher_fields": ("researcher_id", "field_id"),
    "researcher_chunks": ("researcher_id", "project_id", "chunk_index", "content", "embedding"),
}
KEYS = {
    "fields": ("id",),
    "terms": ("field_id", "term"),
    "researchers": ("id",),
    "researcher_fields": ("researcher_id", "field_id"),
    "researcher_chunks": ("researcher_id", "project_id", "chunk_index"),
}
SELECT_SQL = {
    "fields": "SELECT id, name, summary, misconception, embedding FROM fields",
    "terms": "SELECT id, field_id, term, description, embedding FROM terms",
    "researchers": "SELECT id, name, affiliation, theme, kaken_url, embedding FROM researchers",
    "researcher_fields": "SELECT researcher_id, field_id FROM researcher_fields",
    "researcher_chunks": "SELECT researcher_id, project_id, chunk_index, content, embedding FROM researcher_chunks",
}
UPSERT_SQL = {
    "fields": """INSERT INTO fields (id, name, summary, misconception, embedding)
        VALUES (%s, %s, %s, %s, %s::vector)
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, summary = EXCLUDED.summary,
          misconception = EXCLUDED.misconception, embedding = EXCLUDED.embedding""",
    "terms_insert": """INSERT INTO terms (field_id, term, description, embedding)
        VALUES (%s, %s, %s, %s::vector)""",
    "terms_update": """UPDATE terms SET field_id = %s, term = %s, description = %s,
        embedding = %s::vector WHERE id = %s""",
    "researchers": """INSERT INTO researchers (id, name, affiliation, theme, kaken_url, embedding)
        VALUES (%s, %s, %s, %s, %s, %s::vector)
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, affiliation = EXCLUDED.affiliation,
          theme = EXCLUDED.theme, kaken_url = EXCLUDED.kaken_url, embedding = EXCLUDED.embedding""",
    "researcher_fields": """INSERT INTO researcher_fields (researcher_id, field_id)
        VALUES (%s, %s) ON CONFLICT (researcher_id, field_id) DO NOTHING""",
    "researcher_chunks": """INSERT INTO researcher_chunks
        (researcher_id, project_id, chunk_index, content, embedding)
        VALUES (%s, %s, %s, %s, %s::vector)
        ON CONFLICT (researcher_id, project_id, chunk_index) DO UPDATE SET
          content = EXCLUDED.content, embedding = EXCLUDED.embedding""",
}
ALIGN_TERMS_SEQUENCE_SQL = """SELECT setval(
    pg_get_serial_sequence('public.terms', 'id')::regclass,
    GREATEST(
      COALESCE((SELECT max(id) FROM public.terms), 1),
      COALESCE((SELECT last_value FROM public.terms_id_seq), 1)
    ),
    true
  )"""
DELETE_SQL = {
    "researcher_chunks": "DELETE FROM researcher_chunks WHERE researcher_id = %s AND project_id = %s AND chunk_index = %s",
    "researcher_fields": "DELETE FROM researcher_fields WHERE researcher_id = %s AND field_id = %s",
    "terms": "DELETE FROM terms WHERE id = %s",
    "researchers": "DELETE FROM researchers WHERE id = %s",
    "fields": "DELETE FROM fields WHERE id = %s",
}
COUNT_SQL = {table: f"SELECT count(*) FROM {table}" for table in TABLES}
EXPECTED_INPUTS = (
    "researchers.json",
    "fields.yaml",
    "researcher_fields.json",
    "shared/embedding.json",
)


class LoadError(Exception):
    """An input or plan error with a safe message for CLI output."""


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _env_url(path: Path) -> str:
    try:
        lines = path.read_text(encoding="utf-8-sig").splitlines()
    except OSError:
        return ""
    for line in lines:
        key, separator, value = line.strip().partition("=")
        if separator and key.strip() == "DATABASE_URL":
            value = value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                value = value[1:-1]
            if value:
                return value
    return ""


def resolve_database_url(env=None, root: Path = ROOT) -> str:
    environment = os.environ if env is None else env
    raw_value = environment.get("DATABASE_URL", "")
    value = raw_value.strip() if isinstance(raw_value, str) else ""
    if value:
        return value
    for path in (root / ".env.local", root / ".env"):
        value = _env_url(path)
        if value:
            return value
    raise LoadError("DATABASE_URL was not found")


def _require_string(row, key, label):
    value = row.get(key)
    if not isinstance(value, str) or not value:
        raise LoadError(f"{label}.{key} must be a non-empty string")
    return value


def _validate_embedding(value, label):
    if not isinstance(value, list) or len(value) != 384:
        raise LoadError(f"{label} embedding must have 384 numeric values")
    numbers = []
    for item in value:
        if type(item) not in (int, float):
            raise LoadError(f"{label} embedding contains a non-numeric value")
        try:
            number = float(item)
        except (OverflowError, ValueError):
            raise LoadError(f"{label} embedding contains an invalid number") from None
        if not math.isfinite(number):
            raise LoadError(f"{label} embedding contains a non-finite value")
        numbers.append(number)
    norm = math.hypot(*numbers)
    if not math.isfinite(norm) or abs(norm - 1.0) > 1e-4:
        raise LoadError(f"{label} embedding is not L2-normalized")


def _unique_rows(rows, keys, label):
    if not isinstance(rows, list):
        raise LoadError(f"{label} must be an array")
    indexed = {}
    for row in rows:
        if not isinstance(row, dict):
            raise LoadError(f"{label} contains an invalid row")
        key = tuple(row.get(name) for name in keys)
        if len(key) == 1:
            key = key[0]
        parts = key if isinstance(key, tuple) else (key,)
        if not all(
            (type(part) is int and part >= 0) if name == "chunk_index"
            else (isinstance(part, str) and bool(part))
            for name, part in zip(keys, parts, strict=True)
        ):
            raise LoadError(f"{label} contains an invalid key")
        if key in indexed:
            raise LoadError(f"{label} contains duplicate keys")
        indexed[key] = row
    return indexed


def validate_dataset(data: dict, root: Path = ROOT) -> dict:
    required = {"metadata", *TABLES}
    if not isinstance(data, dict) or set(data) != required:
        raise LoadError("input must be the five-array chunked embedding output")
    metadata = data["metadata"]
    if not isinstance(metadata, dict):
        raise LoadError("input metadata is invalid")
    config = json.loads((root / "shared" / "embedding.json").read_text(encoding="utf-8"))
    if config.get("dtype") != "q8" or config.get("dimensions") != 384:
        raise LoadError("shared embedding configuration must use q8 and 384 dimensions")
    for key in ("model", "dtype", "dimensions", "query_prefix", "passage_prefix"):
        if metadata.get(key) != config.get(key):
            raise LoadError(f"input metadata does not match shared embedding configuration: {key}")
    if not isinstance(metadata.get("revision"), str) or not re.fullmatch(
        r"[0-9a-f]{40}", metadata["revision"]
    ):
        raise LoadError("input model revision is invalid")
    if type(metadata.get("max_length")) is not int or metadata["max_length"] != 512:
        raise LoadError("input must use the 512-token chunk limit")

    input_hashes = metadata.get("input_sha256")
    input_files = {
        "researchers.json": root / "data" / "researchers.json",
        "fields.yaml": root / "data" / "fields.yaml",
        "researcher_fields.json": root / "data" / "researcher_fields.json",
        "shared/embedding.json": root / "shared" / "embedding.json",
    }
    if not isinstance(input_hashes, dict):
        raise LoadError("input file hashes are missing")
    for name in EXPECTED_INPUTS:
        if input_hashes.get(name) != _sha256(input_files[name]):
            raise LoadError(f"input file hash does not match: {name}")

    fields = _unique_rows(data["fields"], KEYS["fields"], "fields")
    terms = _unique_rows(data["terms"], KEYS["terms"], "terms")
    researchers = _unique_rows(data["researchers"], KEYS["researchers"], "researchers")
    relations = _unique_rows(data["researcher_fields"], KEYS["researcher_fields"], "researcher_fields")
    chunks = _unique_rows(data["researcher_chunks"], KEYS["researcher_chunks"], "researcher_chunks")
    if not all((fields, terms, researchers, relations, chunks)):
        raise LoadError("input tables must not be empty")

    for field_id, row in fields.items():
        for key in ("name", "summary", "misconception"):
            _require_string(row, key, "fields")
        _validate_embedding(row.get("embedding"), "fields")
    for key, row in terms.items():
        if key[0] not in fields:
            raise LoadError("terms references an unknown field")
        _require_string(row, "description", "terms")
        _validate_embedding(row.get("embedding"), "terms")
    for researcher_id, row in researchers.items():
        for key in ("name", "affiliation", "theme", "kaken_url"):
            _require_string(row, key, "researchers")
        _validate_embedding(row.get("embedding"), "researchers")
    for key, row in relations.items():
        if key[0] not in researchers or key[1] not in fields:
            raise LoadError("researcher_fields references an unknown researcher or field")
    first_chunk_embedding = {}
    chunk_indices = {}
    project_ids = set()
    for key, row in chunks.items():
        researcher_id, project_id, chunk_index = key
        if researcher_id not in researchers:
            raise LoadError("researcher_chunks references an unknown researcher")
        if not isinstance(project_id, str) or not project_id or type(chunk_index) is not int or chunk_index < 0:
            raise LoadError("researcher_chunks contains an invalid key")
        _require_string(row, "content", "researcher_chunks")
        if not any(character.isalnum() for character in row["content"]):
            raise LoadError("researcher_chunks content must include a letter or digit")
        _validate_embedding(row.get("embedding"), "researcher_chunks")
        project_ids.add(project_id)
        chunk_indices.setdefault((researcher_id, project_id), []).append(chunk_index)
        first_chunk_embedding.setdefault(researcher_id, row["embedding"])
    for researcher_id, row in researchers.items():
        if researcher_id not in first_chunk_embedding:
            raise LoadError("every researcher must have at least one chunk")
        if row["embedding"] != first_chunk_embedding[researcher_id]:
            raise LoadError("researcher embedding must match its first chunk")
    for indices in chunk_indices.values():
        if sorted(indices) != list(range(len(indices))):
            raise LoadError("researcher chunk indexes must start at zero and be contiguous")

    chunk_metadata = metadata.get("chunking")
    if (
        not isinstance(chunk_metadata, dict)
        or type(chunk_metadata.get("truncated_input_count")) is not int
        or chunk_metadata["truncated_input_count"] != 0
    ):
        raise LoadError("input must record zero truncated chunks")
    if (
        any(type(chunk_metadata.get(key)) is not int for key in (
            "unique_project_count", "computed_chunk_count", "saved_chunk_count"
        ))
        or chunk_metadata["unique_project_count"] != len(project_ids)
        or chunk_metadata["computed_chunk_count"] != len({row["content"] for row in chunks.values()})
        or chunk_metadata["saved_chunk_count"] != len(chunks)
    ):
        raise LoadError("chunk counts do not match input rows")
    return data


def load_dataset(root: Path = ROOT) -> dict:
    try:
        data = json.loads((root / "data" / "raw" / "embeddings_chunked.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        raise LoadError("chunked embedding input could not be read") from None
    return validate_dataset(data, root)


def _key(table, row):
    parts = tuple(row[name] for name in KEYS[table])
    return parts[0] if len(parts) == 1 else parts


def _index_current(table, rows):
    indexed = {}
    for row in rows:
        key = _key(table, row)
        if key in indexed:
            raise LoadError(f"database contains duplicate {table} keys")
        indexed[key] = row
    return indexed


def plan_changes(target: dict, current: dict) -> dict:
    plan = {}
    for table in TABLES:
        target_rows = _index_current(table, target[table])
        current_rows = _index_current(table, current.get(table, []))
        plan[table] = {
            "add": sorted(target_rows.keys() - current_rows.keys()),
            "update": sorted(target_rows.keys() & current_rows.keys()),
            "delete": sorted(current_rows.keys() - target_rows.keys()),
            "current_by_key": current_rows,
        }
    return plan


def _has_deletes(plan):
    return any(change["delete"] for change in plan.values())


def print_plan(plan, mode):
    print(mode)
    for table in TABLES:
        change = plan[table]
        print(
            f"{table}: add {len(change['add'])}, update {len(change['update'])}, "
            f"delete candidates {len(change['delete'])}"
        )
    print("matching keys are counted as update targets; row values are not compared")


def read_current(cursor):
    rows = {}
    exists = {}
    for table in TABLES:
        cursor.execute("SELECT to_regclass(%s)", (f"public.{table}",))
        exists[table] = cursor.fetchone()[0] is not None
        rows[table] = []
        if exists[table]:
            cursor.execute(SELECT_SQL[table])
            rows[table] = [dict(zip(COLUMNS[table], row, strict=True)) for row in cursor.fetchall()]
            _index_current(table, rows[table])
    return rows, exists


def _vector_literal(vector):
    return "[" + ",".join(repr(float(value)) for value in vector) + "]"


def _target_params(table, row):
    values = [row[key] for key in COLUMNS[table]]
    if "embedding" in COLUMNS[table]:
        values[COLUMNS[table].index("embedding")] = _vector_literal(row["embedding"])
    return tuple(values)


def _write_upserts(cursor, target, plan):
    field_params = [_target_params("fields", row) for row in target["fields"]]
    if field_params:
        cursor.executemany(UPSERT_SQL["fields"], field_params)

    term_updates, term_inserts = [], []
    current_terms = plan["terms"]["current_by_key"]
    for row in target["terms"]:
        key = _key("terms", row)
        params = (row["field_id"], row["term"], row["description"], _vector_literal(row["embedding"]))
        if key in current_terms:
            term_updates.append((*params, current_terms[key]["id"]))
        else:
            term_inserts.append(params)
    if term_updates:
        cursor.executemany(UPSERT_SQL["terms_update"], term_updates)
    if term_inserts:
        cursor.execute(ALIGN_TERMS_SEQUENCE_SQL)
        cursor.executemany(UPSERT_SQL["terms_insert"], term_inserts)

    for table in ("researchers", "researcher_fields", "researcher_chunks"):
        params = [_target_params(table, row) for row in target[table]]
        if params:
            cursor.executemany(UPSERT_SQL[table], params)


def _write_deletes(cursor, plan):
    for table in ("researcher_chunks", "researcher_fields", "terms", "researchers", "fields"):
        keys = plan[table]["delete"]
        if table == "terms":
            params = [(plan[table]["current_by_key"][key]["id"],) for key in keys]
        else:
            params = [key if isinstance(key, tuple) else (key,) for key in keys]
        if params:
            cursor.executemany(DELETE_SQL[table], params)


def _backup_current(current, exists, metadata, raw_dir: Path) -> Path:
    raw_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    path = raw_dir / f"db_backup_{timestamp}.json"
    payload = {
        "metadata": {
            "created_at_utc": timestamp,
            "target_embedding": {
                "model": metadata["model"],
                "revision": metadata["revision"],
                "dtype": metadata["dtype"],
                "dimensions": metadata["dimensions"],
                "input_sha256": metadata["input_sha256"],
            },
        },
        "tables": {table: current[table] for table in TABLES if exists[table]},
    }
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=raw_dir, prefix=".db-backup-", suffix=".tmp", delete=False
        ) as file:
            temp_path = Path(file.name)
            json.dump(payload, file, ensure_ascii=False, allow_nan=False, default=str)
            file.flush()
            os.fsync(file.fileno())
        os.replace(temp_path, path)
    finally:
        if temp_path is not None:
            temp_path.unlink(missing_ok=True)
    return path


def _verify_counts(cursor, target):
    for table in TABLES:
        cursor.execute(COUNT_SQL[table])
        actual = cursor.fetchone()[0]
        if actual != len(target[table]):
            raise LoadError(f"post-sync row count mismatch for {table}")


def apply_database(connection, target, prune=False, raw_dir: Path = RAW_DIR, migration_path: Path = MIGRATION_PATH):
    migration_sql = migration_path.read_text(encoding="utf-8")
    with connection.transaction():
        with connection.cursor() as cursor:
            current, exists = read_current(cursor)
            plan = plan_changes(target, current)
            if _has_deletes(plan) and not prune:
                print_plan(plan, "apply refused: deletions require both --apply and --prune")
                raise LoadError("delete candidates exist; rerun with --apply --prune after review")
            missing = [table for table in CORE_TABLES if not exists[table]]
            if missing:
                raise LoadError("required application tables are missing")
            backup_path = _backup_current(current, exists, target["metadata"], raw_dir)
            cursor.execute(migration_sql)
            _write_upserts(cursor, target, plan)
            if prune:
                _write_deletes(cursor, plan)
            _verify_counts(cursor, target)
    print_plan(plan, "applied")
    print(f"backup: data/raw/{backup_path.name}")
    return plan


def dry_run(connection, target):
    with connection.transaction():
        with connection.cursor() as cursor:
            cursor.execute("SET TRANSACTION READ ONLY")
            current, _ = read_current(cursor)
            plan = plan_changes(target, current)
    print_plan(plan, "dry-run (read-only; no DDL or data changes)")
    return plan


def _safe_error(error):
    return str(error) if isinstance(error, LoadError) else type(error).__name__


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Plan or sync prepared embeddings to PostgreSQL")
    parser.add_argument("--apply", action="store_true", help="apply the plan in one transaction")
    parser.add_argument("--prune", action="store_true", help="allow deletion of obsolete keys with --apply")
    args = parser.parse_args(argv)
    try:
        target = load_dataset()
        database_url = resolve_database_url()
        import psycopg

        with psycopg.connect(database_url, connect_timeout=15) as connection:
            if args.apply:
                apply_database(connection, target, prune=args.prune)
            else:
                dry_run(connection, target)
        return 0
    except Exception as error:
        print(f"error: {_safe_error(error)}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
