"""立命館大学以外の大学の先生を、DB に追加する（その大学の分だけを、入れ替える）。

既存の load_data.py は「DB 全体を、入力に一致させる」道具で、立命館大学のデータに使う。
こちらは、**1 つの大学だけ**を対象にする。他の大学・分野（fields）・用語（terms）には、触れない。

    python data/load_university.py --university tsukuba            # 確認だけ（DB は変えない）
    python data/load_university.py --university tsukuba --apply     # 入れる（1 回のトランザクション）
    python data/load_university.py --university tsukuba --remove --apply   # その大学を取り除く

入力は data/raw/<slug>/embeddings_chunked.json（data/embed_data.py --university <slug> の出力）。
圧縮した embeddings_chunked.json.gz を、解凍せずに置いてもよい。
先に db/migrations/20261115_add_university.sql を実行しておく。接続先は DATABASE_URL（.env.local か環境変数）。
"""

from __future__ import annotations

import argparse
import gzip
import json
import math
from pathlib import Path
import re

from load_data import LoadError, resolve_database_url

ROOT = Path(__file__).resolve().parents[1]
BATCH = 500
DIMENSIONS = 384

SQL_HAS_COLUMN = """SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'researchers' AND column_name = 'university_id'"""
SQL_FIELD_IDS = "SELECT id FROM fields"
SQL_COUNT = "SELECT count(*) FROM researchers WHERE university_id = %s"
SQL_COUNT_CHUNKS = """SELECT count(*) FROM researcher_chunks
    WHERE researcher_id IN (SELECT id FROM researchers WHERE university_id = %s)"""
SQL_DELETE_CHUNKS = """DELETE FROM researcher_chunks
    WHERE researcher_id IN (SELECT id FROM researchers WHERE university_id = %s)"""
SQL_DELETE_FIELDS = """DELETE FROM researcher_fields
    WHERE researcher_id IN (SELECT id FROM researchers WHERE university_id = %s)"""
SQL_DELETE_RESEARCHERS = "DELETE FROM researchers WHERE university_id = %s"
SQL_INSERT_RESEARCHER = """INSERT INTO researchers
    (id, name, affiliation, theme, kaken_url, university_id, embedding)
    VALUES (%s, %s, %s, %s, %s, %s, %s::vector)"""
SQL_INSERT_CHUNK = """INSERT INTO researcher_chunks
    (researcher_id, project_id, chunk_index, content, embedding)
    VALUES (%s, %s, %s, %s, %s::vector)"""
SQL_INSERT_RELATION = "INSERT INTO researcher_fields (researcher_id, field_id) VALUES (%s, %s)"


def _vector_literal(vector) -> str:
    return "[" + ",".join(repr(float(value)) for value in vector) + "]"


def _check_embedding(value, label: str) -> None:
    if not isinstance(value, list) or len(value) != DIMENSIONS:
        raise LoadError(f"{label}: embedding must have {DIMENSIONS} numbers")
    total = 0.0
    for item in value:
        if type(item) not in (int, float) or not math.isfinite(float(item)):
            raise LoadError(f"{label}: embedding has an invalid number")
        total += float(item) ** 2
    if abs(math.sqrt(total) - 1.0) > 1e-4:
        raise LoadError(f"{label}: embedding is not L2-normalized")


def load_file(path: Path, slug: str, config: dict | None = None) -> dict:
    """出力ファイルを読み、形・ID・ベクトルを調べる。DB には触れない。"""
    if not re.fullmatch(r"[a-z][a-z0-9]*", slug) or slug == "ritsumei":
        raise LoadError("university slug must be a lowercase name other than ritsumei")
    try:
        # 圧縮したまま（.json.gz）でも読める。受け取ったファイルを、解凍せずに置けばよい
        raw = gzip.open(path, "rt", encoding="utf-8") if path.suffix == ".gz" else path.open(encoding="utf-8")
        with raw as file:
            data = json.load(file)
    except (OSError, json.JSONDecodeError, EOFError):
        raise LoadError(f"input could not be read: {path}") from None
    if not isinstance(data, dict):
        raise LoadError("input must be a JSON object")
    for key in ("metadata", "researchers", "researcher_fields", "researcher_chunks"):
        if key not in data:
            raise LoadError(f"input is missing: {key}")

    if config is None:
        config = json.loads((ROOT / "shared" / "embedding.json").read_text(encoding="utf-8"))
    metadata = data["metadata"]
    for key in ("model", "dtype", "dimensions", "query_prefix", "passage_prefix"):
        if metadata.get(key) != config.get(key):
            raise LoadError(f"metadata does not match shared/embedding.json: {key}")

    prefix = f"{slug}:"
    researchers = data["researchers"]
    ids: set[str] = set()
    for row in researchers:
        label = f"researcher {row.get('id')!r}"
        if not isinstance(row.get("id"), str) or not row["id"].startswith(prefix):
            raise LoadError(f"{label}: id must start with {prefix}")
        if row["id"] in ids:
            raise LoadError(f"{label}: duplicate id")
        ids.add(row["id"])
        if row.get("university_id") != slug:
            raise LoadError(f"{label}: university_id must be {slug}")
        for key in ("name", "affiliation", "theme", "kaken_url"):
            if not isinstance(row.get(key), str) or not row[key]:
                raise LoadError(f"{label}: {key} must be a non-empty string")
        _check_embedding(row.get("embedding"), label)

    chunk_keys: set[tuple] = set()
    for row in data["researcher_chunks"]:
        key = (row.get("researcher_id"), row.get("project_id"), row.get("chunk_index"))
        if key[0] not in ids:
            raise LoadError(f"chunk refers to an unknown researcher: {key[0]!r}")
        if not isinstance(key[1], str) or not key[1] or type(key[2]) is not int or key[2] < 0:
            raise LoadError("chunk has an invalid project_id or chunk_index")
        if key in chunk_keys:
            raise LoadError("duplicate chunk key")
        chunk_keys.add(key)
        if not isinstance(row.get("content"), str) or not row["content"]:
            raise LoadError("chunk content must be a non-empty string")
        _check_embedding(row.get("embedding"), f"chunk {key}")

    relation_keys: set[tuple] = set()
    for row in data["researcher_fields"]:
        key = (row.get("researcher_id"), row.get("field_id"))
        if key[0] not in ids or not isinstance(key[1], str) or not key[1]:
            raise LoadError("researcher_fields has an unknown researcher or an invalid field_id")
        if key in relation_keys:
            raise LoadError("duplicate researcher_fields relation")
        relation_keys.add(key)
    return data


def _preflight(cursor, data: dict | None) -> None:
    cursor.execute(SQL_HAS_COLUMN)
    if cursor.fetchone() is None:
        raise LoadError("researchers.university_id is missing: run db/migrations/20261115_add_university.sql first")
    if data is not None:
        cursor.execute(SQL_FIELD_IDS)
        known = {row[0] for row in cursor.fetchall()}
        unknown = {row["field_id"] for row in data["researcher_fields"]} - known
        if unknown:
            raise LoadError(f"fields missing in the database: {sorted(unknown)[:5]}")


def _batches(rows: list, size: int = BATCH):
    for start in range(0, len(rows), size):
        yield rows[start : start + size]


def run(connection, slug: str, data: dict | None, apply: bool, remove: bool = False) -> dict:
    """data が None のときは、取り除くだけ（remove）。apply=False なら、DB は変えない。"""
    with connection.transaction():
        with connection.cursor() as cursor:
            if not apply:
                cursor.execute("SET TRANSACTION READ ONLY")
            _preflight(cursor, None if remove else data)
            cursor.execute(SQL_COUNT, (slug,))
            before_researchers = cursor.fetchone()[0]
            cursor.execute(SQL_COUNT_CHUNKS, (slug,))
            before_chunks = cursor.fetchone()[0]
            summary = {
                "university": slug,
                "mode": "remove" if remove else "replace",
                "applied": apply,
                "before": {"researchers": before_researchers, "chunks": before_chunks},
                "after": (
                    {"researchers": 0, "chunks": 0}
                    if remove
                    else {
                        "researchers": len(data["researchers"]),
                        "chunks": len(data["researcher_chunks"]),
                        "relations": len(data["researcher_fields"]),
                    }
                ),
            }
            if not apply:
                return summary

            # この大学の分だけを消してから、入れ直す（途中で失敗したら、全部もとに戻る）
            cursor.execute(SQL_DELETE_CHUNKS, (slug,))
            cursor.execute(SQL_DELETE_FIELDS, (slug,))
            cursor.execute(SQL_DELETE_RESEARCHERS, (slug,))
            if not remove:
                for batch in _batches(data["researchers"]):
                    cursor.executemany(
                        SQL_INSERT_RESEARCHER,
                        [
                            (
                                row["id"], row["name"], row["affiliation"], row["theme"],
                                row["kaken_url"], slug, _vector_literal(row["embedding"]),
                            )
                            for row in batch
                        ],
                    )
                for batch in _batches(data["researcher_chunks"]):
                    cursor.executemany(
                        SQL_INSERT_CHUNK,
                        [
                            (
                                row["researcher_id"], row["project_id"], row["chunk_index"],
                                row["content"], _vector_literal(row["embedding"]),
                            )
                            for row in batch
                        ],
                    )
                for batch in _batches(data["researcher_fields"]):
                    cursor.executemany(
                        SQL_INSERT_RELATION, [(row["researcher_id"], row["field_id"]) for row in batch]
                    )
            # 入れた結果を、同じトランザクションの中で数える。合わなければ、全部もとに戻る
            cursor.execute(SQL_COUNT, (slug,))
            got_researchers = cursor.fetchone()[0]
            cursor.execute(SQL_COUNT_CHUNKS, (slug,))
            got_chunks = cursor.fetchone()[0]
            expected = summary["after"]
            if got_researchers != expected["researchers"] or got_chunks != expected["chunks"]:
                raise LoadError("row counts after the load do not match the input; rolled back")
            summary["verified"] = {"researchers": got_researchers, "chunks": got_chunks}
    return summary


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="立命館大学以外の大学の先生を、DB に追加する")
    parser.add_argument("--university", required=True, help="対象の大学の slug。例: tsukuba")
    parser.add_argument("--apply", action="store_true", help="DB に書き込む（指定しなければ、確認だけ）")
    parser.add_argument("--remove", action="store_true", help="その大学を取り除く（--apply と合わせて使う）")
    parser.add_argument("--file", default=None, help="入力ファイル。既定は data/raw/<slug>/embeddings_chunked.json")
    args = parser.parse_args(argv)
    try:
        if args.file:
            path = Path(args.file)
        else:
            directory = ROOT / "data" / "raw" / args.university
            path = directory / "embeddings_chunked.json"
            if not path.exists():
                path = directory / "embeddings_chunked.json.gz"
        if args.remove:
            if not re.fullmatch(r"[a-z][a-z0-9]*", args.university) or args.university == "ritsumei":
                raise LoadError("university slug must be a lowercase name other than ritsumei")
            data = None
        else:
            data = load_file(path, args.university)
        import psycopg

        with psycopg.connect(resolve_database_url(), connect_timeout=15) as connection:
            summary = run(connection, args.university, data, apply=args.apply, remove=args.remove)
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        if not args.apply:
            print("確認だけです。DB は変えていません。入れるときは --apply を付けてください。")
        return 0
    except LoadError as error:
        print(f"error: {error}")
        return 1
    except Exception as error:
        print(f"error: {type(error).__name__}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
