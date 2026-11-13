"""Build local, normalized embeddings for the database seed data."""

import hashlib
import importlib.metadata
import json
import os
import platform
import re
import tempfile
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
RAW_DIR = DATA_DIR / "raw"
HF_CACHE_DIR = RAW_DIR / "model_cache" / "hub"
OUTPUT_PATH = RAW_DIR / "embeddings_chunked.json"
BATCH_SIZE = 4
ONNX_FILENAME = "onnx/model_quantized.onnx"


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def pool_masked_mean(hidden_states, attention_mask):
    hidden_states = np.asarray(hidden_states, dtype=np.float32)
    attention_mask = np.asarray(attention_mask)
    if hidden_states.ndim != 3 or attention_mask.shape != hidden_states.shape[:2]:
        raise ValueError("hidden states and attention mask have incompatible shapes")
    if not np.isfinite(hidden_states).all() or not np.isin(attention_mask, (0, 1)).all():
        raise ValueError("hidden states and attention mask must be finite and valid")
    token_counts = attention_mask.sum(axis=1, keepdims=True)
    if np.any(token_counts == 0):
        raise ValueError("attention mask must include at least one token per input")
    return (hidden_states * attention_mask[:, :, None]).sum(axis=1) / token_counts


def normalize_embeddings(vectors, dimensions):
    vectors = np.asarray(vectors, dtype=np.float32)
    if vectors.ndim != 2 or vectors.shape[1] != dimensions:
        raise ValueError(f"expected a 2D array with {dimensions} dimensions")
    if not np.isfinite(vectors).all():
        raise ValueError("embeddings must contain only finite values")
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    if np.any(norms == 0) or not np.isfinite(norms).all():
        raise ValueError("embeddings must have a finite, non-zero norm")
    return vectors / norms


def _unique_ids(records, key, label):
    ids = [record.get(key) for record in records]
    if any(not isinstance(value, str) or not value for value in ids):
        raise ValueError(f"{label} IDs must be non-empty strings")
    if len(ids) != len(set(ids)):
        raise ValueError(f"duplicate {label} ID")
    return set(ids)


def validate_inputs(fields, researchers, researcher_fields):
    if not all(isinstance(rows, list) for rows in (fields, researchers, researcher_fields)):
        raise ValueError("input records must be arrays")
    field_ids = _unique_ids(fields, "id", "field")
    researcher_ids = _unique_ids(researchers, "id", "researcher")
    pairs = set()
    for row in fields:
        for key in ("name", "summary", "misconception"):
            if not isinstance(row.get(key), str):
                raise ValueError(f"field {row['id']} must have string {key}")
        terms = row.get("terms")
        if not isinstance(terms, list) or not 3 <= len(terms) <= 5:
            raise ValueError(f"field {row['id']} must have three to five terms")
        term_names = []
        for term in terms:
            if not isinstance(term, dict) or not all(
                isinstance(term.get(key), str) for key in ("term", "description")
            ):
                raise ValueError(f"field {row['id']} has an invalid term")
            if not term["term"].strip() or not term["description"].strip():
                raise ValueError(f"field {row['id']} has an empty term or description")
            term_names.append(term["term"])
        if len(term_names) != len(set(term_names)):
            raise ValueError(f"field {row['id']} has duplicate term names")
    for row in researchers:
        for key in ("name", "affiliation", "kaken_url", "theme"):
            if not isinstance(row.get(key), str):
                raise ValueError(f"researcher {row['id']} must have string {key}")
        projects = row.get("projects")
        if not isinstance(projects, list):
            raise ValueError(f"researcher {row['id']} must have a projects array")
    for row in researcher_fields:
        researcher_id, field_id = row.get("researcher_id"), row.get("field_id")
        if researcher_id not in researcher_ids or field_id not in field_ids:
            raise ValueError("researcher_fields contains an unknown researcher or field ID")
        pair = (researcher_id, field_id)
        if pair in pairs:
            raise ValueError("duplicate researcher_fields relation")
        pairs.add(pair)


def _read_inputs():
    import yaml

    researchers_data = json.loads((DATA_DIR / "researchers.json").read_text(encoding="utf-8"))
    researcher_fields_data = json.loads(
        (DATA_DIR / "researcher_fields.json").read_text(encoding="utf-8")
    )
    fields = yaml.safe_load((DATA_DIR / "fields.yaml").read_text(encoding="utf-8"))
    if not isinstance(researchers_data, dict) or not isinstance(researcher_fields_data, dict):
        raise ValueError("researcher inputs must be JSON objects")
    researchers = researchers_data.get("researchers")
    researcher_fields = researcher_fields_data.get("researcher_fields")
    validate_inputs(fields, researchers, researcher_fields)
    return fields, researchers, researcher_fields


def _token_count(tokenizer, text):
    tokenizer.no_truncation()
    tokenizer.no_padding()
    return len(tokenizer.encode(text, add_special_tokens=True).ids)


def split_text(text, tokenizer, prefix, max_length):
    if not isinstance(text, str) or not text:
        raise ValueError("project text must not be empty")
    if not any(character.isalnum() for character in text):
        raise ValueError("project text must include a letter or digit")
    tokenizer.no_truncation()
    tokenizer.no_padding()
    prefix_tokens = len(tokenizer.encode(prefix, add_special_tokens=False).ids)
    special_tokens = len(tokenizer.encode("", add_special_tokens=True).ids)
    token_budget = max_length - prefix_tokens - special_tokens
    if token_budget < 1:
        raise ValueError("prefix and special tokens leave no room for project text")

    chunks = []
    start = 0
    while start < len(text):
        tail = text[start:]
        encoding = tokenizer.encode(prefix + tail, add_special_tokens=True)
        if len(encoding.ids) <= max_length:
            chunks.append(tail)
            break

        ends = [end - len(prefix) for _, end in encoding.offsets if end > len(prefix)]
        candidates = ends[:token_budget]
        accepted_end = next(
            (
                end
                for end in reversed(candidates)
                if 0 < end <= len(tail)
                and _token_count(tokenizer, prefix + tail[:end]) <= max_length
            ),
            None,
        )
        if accepted_end is None:
            raise ValueError("could not find a safe tokenizer offset for project chunk")
        if not any(character.isalnum() for character in tail[:accepted_end]):
            accepted_end = next(
                (
                    end
                    for end in reversed(ends)
                    if end > accepted_end
                    and end <= len(tail)
                    and any(character.isalnum() for character in tail[:end])
                    and _token_count(tokenizer, prefix + tail[:end]) <= max_length
                ),
                None,
            )
            if accepted_end is None:
                raise ValueError("could not find a project chunk containing a letter or digit")
        if not any(character.isalnum() for character in tail[accepted_end:]):
            sentence_end = next(
                (
                    end
                    for end in reversed(ends)
                    if 0 < end < accepted_end
                    and tail[end - 1] in "。.!?！？"
                    and any(character.isalnum() for character in tail[:end])
                    and any(character.isalnum() for character in tail[end:])
                    and _token_count(tokenizer, prefix + tail[:end]) <= max_length
                    and _token_count(tokenizer, prefix + tail[end:]) <= max_length
                ),
                None,
            )
            accepted_end = sentence_end or next(
                (
                    end
                    for end in reversed(ends)
                    if 0 < end < accepted_end
                    and any(character.isalnum() for character in tail[:end])
                    and any(character.isalnum() for character in tail[end:])
                    and _token_count(tokenizer, prefix + tail[:end]) <= max_length
                    and _token_count(tokenizer, prefix + tail[end:]) <= max_length
                ),
                None,
            )
            if accepted_end is None:
                raise ValueError("could not split project text without a symbol-only chunk")
        chunks.append(tail[:accepted_end])
        start += accepted_end

    if (
        not chunks
        or any(not any(character.isalnum() for character in chunk) for chunk in chunks)
        or "".join(chunks) != text
    ):
        raise ValueError("project text chunking did not preserve the source text")
    if any(_token_count(tokenizer, prefix + chunk) > max_length for chunk in chunks):
        raise ValueError("project chunk exceeds the model token limit")
    return chunks


def build_project_texts(researchers):
    from fetch_kaken import _researcher_theme

    text_by_id = {}
    projects_by_researcher = {}
    for researcher in researchers:
        researcher_id = researcher["id"]
        project_ids = []
        for project in researcher["projects"]:
            if not isinstance(project, dict):
                raise ValueError(f"researcher {researcher_id} has an invalid project")
            project_id = project.get("id")
            if not isinstance(project_id, str) or not project_id:
                raise ValueError(f"researcher {researcher_id} has a project without an ID")
            if project_id in project_ids:
                raise ValueError(f"researcher {researcher_id} has duplicate project ID {project_id}")
            if not isinstance(project.get("title"), str) or not isinstance(project.get("abstract"), str):
                raise ValueError(f"project {project_id} has invalid title or abstract")
            if not isinstance(project.get("keywords"), list) or not all(
                isinstance(keyword, str) for keyword in project["keywords"]
            ):
                raise ValueError(f"project {project_id} has invalid keywords")

            project_text = _researcher_theme([project])
            if not project_text:
                raise ValueError(f"project {project_id} has no text to embed")
            previous = text_by_id.setdefault(project_id, project_text)
            if previous != project_text:
                raise ValueError(f"project {project_id} has conflicting source text")
            project_ids.append(project_id)
        if not project_ids:
            raise ValueError(f"researcher {researcher_id} has no projects for chunk embeddings")
        projects_by_researcher[researcher_id] = project_ids
    return text_by_id, projects_by_researcher


def _encode_texts(
    texts, label, prefix, tokenizer, session, max_length, dimensions, pad_token, pad_id, padding_side
):
    input_names = {item.name for item in session.get_inputs()}
    output_names = {item.name for item in session.get_outputs()}
    if "input_ids" not in input_names or "attention_mask" not in input_names:
        raise ValueError("ONNX model must accept input_ids and attention_mask")
    if "last_hidden_state" not in output_names:
        raise ValueError("ONNX model must output last_hidden_state")

    vectors = []
    tokenizer.no_truncation()
    for start in range(0, len(texts), BATCH_SIZE):
        batch = [prefix + text for text in texts[start : start + BATCH_SIZE]]
        tokenizer.no_padding()
        untruncated = tokenizer.encode_batch(batch, add_special_tokens=True)
        overlong = [start + index for index, item in enumerate(untruncated) if len(item.ids) > max_length]
        if overlong:
            raise ValueError(f"{label} inputs exceed {max_length} tokens: {overlong[:5]}")
        tokenizer.enable_padding(direction=padding_side, pad_id=pad_id, pad_token=pad_token)
        encoded = tokenizer.encode_batch(batch, add_special_tokens=True)
        arrays = {
            "input_ids": np.asarray([item.ids for item in encoded], dtype=np.int64),
            "attention_mask": np.asarray([item.attention_mask for item in encoded], dtype=np.int64),
            "token_type_ids": np.asarray([item.type_ids for item in encoded], dtype=np.int64),
        }
        missing = input_names.difference(arrays)
        if missing:
            raise ValueError(f"tokenizer did not provide ONNX inputs: {sorted(missing)}")
        feeds = {name: arrays[name] for name in input_names}
        hidden = session.run(["last_hidden_state"], feeds)[0]
        pooled = pool_masked_mean(hidden, arrays["attention_mask"])
        vectors.extend(normalize_embeddings(pooled, dimensions).tolist())
        print(f"{label}: {min(start + len(batch), len(texts))}/{len(texts)}", flush=True)
    return vectors


def _library_versions():
    return {
        "python": platform.python_version(),
        "numpy": importlib.metadata.version("numpy"),
        "onnxruntime": importlib.metadata.version("onnxruntime"),
        "tokenizers": importlib.metadata.version("tokenizers"),
        "huggingface_hub": importlib.metadata.version("huggingface-hub"),
        "PyYAML": importlib.metadata.version("PyYAML"),
    }


def _write_output_atomically(data):
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=RAW_DIR, prefix=".embeddings-", suffix=".tmp", delete=False
        ) as file:
            temp_path = Path(file.name)
            json.dump(data, file, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
            file.flush()
            os.fsync(file.fileno())
        os.replace(temp_path, OUTPUT_PATH)
    finally:
        if temp_path is not None:
            temp_path.unlink(missing_ok=True)


def main():
    fields, researchers, researcher_fields = _read_inputs()
    config = json.loads((ROOT / "shared" / "embedding.json").read_text(encoding="utf-8"))
    model_id = config["model"]
    dimensions = int(config["dimensions"])
    if config["dtype"] != "q8":
        raise ValueError("embed_data.py requires dtype=q8 in shared/embedding.json")

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    HF_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    from huggingface_hub import hf_hub_download, model_info

    revision = model_info(model_id, revision="main", token=False).sha
    if not isinstance(revision, str) or not re.fullmatch(r"[0-9a-f]{40}", revision):
        raise ValueError("Hugging Face did not return a valid model revision SHA")
    cache_dir = str(HF_CACHE_DIR)
    config_path = hf_hub_download(
        model_id, filename="config.json", revision=revision, cache_dir=cache_dir, token=False
    )
    model_path = hf_hub_download(
        model_id, filename=ONNX_FILENAME, revision=revision, cache_dir=cache_dir, token=False
    )
    tokenizer_path = hf_hub_download(
        model_id, filename="tokenizer.json", revision=revision, cache_dir=cache_dir, token=False
    )
    tokenizer_config_path = hf_hub_download(
        model_id,
        filename="tokenizer_config.json",
        revision=revision,
        cache_dir=cache_dir,
        token=False,
    )
    model_config = json.loads(Path(config_path).read_text(encoding="utf-8"))
    max_length = int(model_config["max_position_embeddings"])
    if int(model_config["hidden_size"]) != dimensions:
        raise ValueError("model hidden size does not match shared/embedding.json")

    from tokenizers import Tokenizer

    tokenizer = Tokenizer.from_file(tokenizer_path)
    tokenizer_config = json.loads(Path(tokenizer_config_path).read_text(encoding="utf-8"))
    pad_token_setting = tokenizer_config["pad_token"]
    pad_token = pad_token_setting if isinstance(pad_token_setting, str) else pad_token_setting["content"]
    pad_id = tokenizer.token_to_id(pad_token)
    if pad_id is None:
        raise ValueError("tokenizer padding token is missing from tokenizer.json")
    padding_side = tokenizer_config.get("padding_side", "right")
    import onnxruntime as ort

    session_options = ort.SessionOptions()
    session_options.intra_op_num_threads = 2
    session = ort.InferenceSession(
        str(model_path), sess_options=session_options, providers=["CPUExecutionProvider"]
    )

    field_texts = [
        " ".join(
            [row["name"], row["summary"]]
            + [part for term in row["terms"] for part in (term["term"], term["description"])]
        )
        for row in fields
    ]
    term_rows = [
        {"field_id": row["id"], "term": term["term"], "description": term["description"]}
        for row in fields
        for term in row["terms"]
    ]
    texts_by_table = {
        "fields": field_texts,
        "terms": [f"{row['term']} {row['description']}" for row in term_rows],
    }
    vectors_by_table = {}
    for table, texts in texts_by_table.items():
        vectors_by_table[table] = _encode_texts(
            texts,
            table,
            config["passage_prefix"],
            tokenizer,
            session,
            max_length,
            dimensions,
            pad_token,
            pad_id,
            padding_side,
        )
        if len(vectors_by_table[table]) != len(texts):
            raise ValueError(f"embedding count does not match {table} input count")

    project_text_by_id, projects_by_researcher = build_project_texts(researchers)
    chunks_by_project = {
        project_id: split_text(text, tokenizer, config["passage_prefix"], max_length)
        for project_id, text in project_text_by_id.items()
    }
    unique_chunk_texts = list(
        dict.fromkeys(chunk for chunks in chunks_by_project.values() for chunk in chunks)
    )
    unique_chunk_vectors = _encode_texts(
        unique_chunk_texts,
        "unique researcher chunks",
        config["passage_prefix"],
        tokenizer,
        session,
        max_length,
        dimensions,
        pad_token,
        pad_id,
        padding_side,
    )
    if len(unique_chunk_vectors) != len(unique_chunk_texts):
        raise ValueError("embedding count does not match unique researcher chunk count")
    vector_by_chunk_text = dict(zip(unique_chunk_texts, unique_chunk_vectors, strict=True))
    researcher_embedding_by_id = {
        researcher_id: vector_by_chunk_text[chunks_by_project[project_ids[0]][0]]
        for researcher_id, project_ids in projects_by_researcher.items()
    }
    researcher_chunk_rows = [
        {
            "researcher_id": researcher_id,
            "project_id": project_id,
            "chunk_index": chunk_index,
            "content": chunk,
            "embedding": vector_by_chunk_text[chunk],
        }
        for researcher_id, project_ids in projects_by_researcher.items()
        for project_id in project_ids
        for chunk_index, chunk in enumerate(chunks_by_project[project_id])
    ]

    input_files = {
        "researchers.json": DATA_DIR / "researchers.json",
        "fields.yaml": DATA_DIR / "fields.yaml",
        "researcher_fields.json": DATA_DIR / "researcher_fields.json",
        "shared/embedding.json": ROOT / "shared" / "embedding.json",
    }
    output = {
        "metadata": {
            "model": model_id,
            "revision": revision,
            "dtype": config["dtype"],
            "dimensions": dimensions,
            "query_prefix": config["query_prefix"],
            "passage_prefix": config["passage_prefix"],
            "max_length": max_length,
            "batch_size": BATCH_SIZE,
            "onnx_file": ONNX_FILENAME,
            "onnx_sha256": sha256_file(model_path),
            "tokenizer_sha256": sha256_file(tokenizer_path),
            "input_sha256": {name: sha256_file(path) for name, path in input_files.items()},
            "library_versions": _library_versions(),
            "preprocessing": {
                "fields": "name, summary, and each term and description joined by spaces",
                "terms": "term and description joined by a space",
                "researchers": "each project title, keywords, and abstract; theme retained unchanged",
                "special_tokens": True,
                "padding": "batch",
                "tokenizer": "tokenizers.Tokenizer from the pinned tokenizer.json",
                "truncation": "none; overlong fields and terms fail, projects split at tokenizer offsets",
                "chunking": "character boundaries; no overlap or text loss",
                "pooling": "attention-mask mean of last_hidden_state",
                "normalization": "L2",
            },
            "chunking": {
                "unique_project_count": len(project_text_by_id),
                "computed_chunk_count": len(unique_chunk_texts),
                "saved_chunk_count": len(researcher_chunk_rows),
                "truncated_input_count": 0,
            },
            "note": "Dynamic q8 batching may cause small numerical differences; bitwise parity is not guaranteed.",
        },
        "fields": [
            {key: row[key] for key in ("id", "name", "summary", "misconception")}
            | {"embedding": vector}
            for row, vector in zip(fields, vectors_by_table["fields"], strict=True)
        ],
        "terms": [
            row | {"embedding": vector}
            for row, vector in zip(term_rows, vectors_by_table["terms"], strict=True)
        ],
        "researchers": [
            {key: row[key] for key in ("id", "name", "affiliation", "theme", "kaken_url")}
            | {"embedding": researcher_embedding_by_id[row["id"]]}
            for row in researchers
        ],
        "researcher_fields": researcher_fields,
        "researcher_chunks": researcher_chunk_rows,
    }
    _write_output_atomically(output)
    print(
        f"Wrote {OUTPUT_PATH}: {len(output['fields'])} fields, {len(output['terms'])} terms, "
        f"{len(output['researchers'])} researchers, {len(output['researcher_fields'])} relations, "
        f"{len(output['researcher_chunks'])} researcher chunks saved.",
        flush=True,
    )


if __name__ == "__main__":
    main()
