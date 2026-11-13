"""Assign researcher fields from an explicit source-key CSV mapping."""

import csv
import json
from pathlib import Path


DATA_DIR = Path(__file__).resolve().parent
INPUT_PATH = DATA_DIR / "researchers.json"
MAPPING_PATH = DATA_DIR / "field_map.csv"
CATALOG_PATH = DATA_DIR / "fields_catalog.json"
OUTPUT_PATH = DATA_DIR / "researcher_fields.json"
REPORT_JSON_PATH = DATA_DIR / "field_mapping_report.json"
REPORT_MD_PATH = DATA_DIR / "field_mapping_report.md"
SOURCE_FIELDS = ("source_kind", "table_type", "nii_code", "path", "source_name")
MAPPING_FIELDS = (*SOURCE_FIELDS, "field_id", "note")


class MappingError(ValueError):
    pass


def _clean(value):
    return "" if value is None else str(value).strip()


def _key(source_kind, source):
    return (
        _clean(source_kind),
        _clean(source.get("table_type")),
        _clean(source.get("code")),
        _clean(source.get("path")),
        _clean(source.get("name")),
    )


def _key_dict(key):
    return dict(zip(SOURCE_FIELDS, key))


def load_catalog(path=CATALOG_PATH):
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    fields = data.get("fields") if isinstance(data, dict) else data
    if not isinstance(fields, list):
        raise MappingError("catalog must contain a fields array")
    catalog = {}
    for field in fields:
        field_id, name = _clean(field.get("id")), _clean(field.get("name"))
        if not field_id or not name or field_id in catalog:
            raise MappingError("catalog has a missing or duplicate id/name")
        catalog[field_id] = name
    return catalog


def load_mapping(path, catalog):
    mappings = {}
    with Path(path).open("r", encoding="utf-8-sig", newline="") as source_file:
        reader = csv.DictReader(source_file)
        if reader.fieldnames != list(MAPPING_FIELDS):
            raise MappingError("field_map.csv has an unexpected header")
        for row_number, row in enumerate(reader, start=2):
            key = tuple(_clean(row[name]) for name in SOURCE_FIELDS)
            if not key[0]:
                raise MappingError(f"row {row_number}: source_kind is required")
            field_id, note = _clean(row["field_id"]), _clean(row["note"])
            if field_id and field_id not in catalog:
                raise MappingError(f"row {row_number}: unknown field_id")
            if not field_id and not note:
                raise MappingError(f"row {row_number}: an unmapped row needs a note")
            entry = mappings.setdefault(key, {
                "field_ids": [], "note": "", "notes": [], "intentionally_unmapped": False,
            })
            if field_id:
                if entry["intentionally_unmapped"]:
                    raise MappingError(f"row {row_number}: blank and mapped rows conflict")
                if field_id in entry["field_ids"]:
                    raise MappingError(f"row {row_number}: duplicate source/field pair")
                entry["field_ids"].append(field_id)
            else:
                if entry["intentionally_unmapped"] or entry["field_ids"]:
                    raise MappingError(f"row {row_number}: duplicate or conflicting blank mapping")
                entry["intentionally_unmapped"] = True
            if note and note not in entry["notes"]:
                entry["notes"].append(note)
                entry["note"] = "\n".join(entry["notes"])
    return mappings


def _review_rank(source):
    name = _clean(source.get("name"))
    folded = name.casefold()
    if name.startswith("小区分") or folded.startswith("basic section") or name.startswith("合同審査対象区分:"):
        return 1
    if name.startswith("中区分") or folded.startswith("medium-sized section"):
        return 2
    if name.startswith("大区分") or folded.startswith("broad section"):
        return 3
    return 4


def _unique_sources(sources):
    unique = {}
    for source in sources:
        key = _key("", source)[1:]
        unique[key] = source
    return list(unique.values())


def project_sources(project):
    review_sections = project.get("review_sections") or []
    if review_sections:
        candidates = _unique_sources(review_sections)
        best_rank = min(_review_rank(source) for source in candidates)
        return [("review_section", source) for source in candidates if _review_rank(source) == best_rank]

    fields = project.get("research_fields") or []
    leaves = []
    for source in fields:
        table_type = _clean(source.get("table_type"))
        path = _clean(source.get("path"))
        has_child = bool(path) and any(
            _clean(other.get("table_type")) == table_type
            and len(_clean(other.get("path"))) > len(path)
            and _clean(other.get("path")).startswith(path)
            for other in fields
        )
        if not has_child:
            leaves.append(source)
    return [("research_field", source) for source in _unique_sources(leaves)]


def build_outputs(researchers, mappings, catalog):
    researcher_ids = set()
    fields_by_researcher = {}
    usage = {}
    for researcher in researchers:
        researcher_id = _clean(researcher.get("id"))
        if not researcher_id or researcher_id in researcher_ids:
            raise MappingError("researchers.json has a missing or duplicate researcher id")
        researcher_ids.add(researcher_id)
        assigned = set()
        for project in researcher.get("projects", []):
            project_id = _clean(project.get("id"))
            for source_kind, source in project_sources(project):
                key = _key(source_kind, source)
                entry = usage.setdefault(key, {"projects": set(), "researchers": set()})
                if project_id:
                    entry["projects"].add(project_id)
                entry["researchers"].add(researcher_id)
                mapping = mappings.get(key)
                if mapping:
                    assigned.update(mapping["field_ids"])
        fields_by_researcher[researcher_id] = assigned

    pairs = [
        {"researcher_id": researcher_id, "field_id": field_id}
        for researcher_id in sorted(fields_by_researcher)
        for field_id in sorted(fields_by_researcher[researcher_id])
    ]
    mapped_ids = {pair["researcher_id"] for pair in pairs}
    unmapped_researchers = []
    researcher_by_id = {_clean(researcher["id"]): researcher for researcher in researchers}
    source_keys_by_researcher = {researcher_id: set() for researcher_id in researcher_ids}
    for key, stats in usage.items():
        mapping = mappings.get(key)
        if not mapping or not mapping["field_ids"]:
            for researcher_id in stats["researchers"]:
                source_keys_by_researcher[researcher_id].add(key)
    for researcher_id in sorted(researcher_ids - mapped_ids):
        researcher = researcher_by_id[researcher_id]
        unmapped_researchers.append({
            "researcher_id": researcher_id,
            "name": _clean(researcher.get("name")),
            "source_keys": [_key_dict(key) for key in sorted(source_keys_by_researcher[researcher_id])],
        })

    source_rows = []
    unmatched_sources = []
    for key, stats in sorted(usage.items()):
        mapping = mappings.get(key)
        row = {
            **_key_dict(key),
            "project_count": len(stats["projects"]),
            "researcher_count": len(stats["researchers"]),
            "field_ids": mapping["field_ids"] if mapping else [],
            "mapping_note": mapping["note"] if mapping else "",
            "reason": "" if mapping and mapping["field_ids"] else mapping["note"] if mapping else "no_mapping_row",
        }
        if not mapping:
            row["status"] = "no_mapping_row"
            unmatched_sources.append(row)
        elif mapping["intentionally_unmapped"]:
            row["status"] = "intentionally_unmapped"
            unmatched_sources.append(row)
        else:
            row["status"] = "mapped"
        source_rows.append(row)

    unused_mappings = [
        {**_key_dict(key), "field_ids": entry["field_ids"], "note": entry["note"],
         "intentionally_unmapped": entry["intentionally_unmapped"]}
        for key, entry in sorted(mappings.items()) if key not in usage
    ]
    field_counts = {field_id: set() for field_id in catalog}
    for pair in pairs:
        field_counts[pair["field_id"]].add(pair["researcher_id"])
    mapped_count = len(mapped_ids)
    total_count = len(researcher_ids)
    report = {
        "summary": {
            "total_researchers": total_count,
            "mapped_researchers": mapped_count,
            "unmapped_researchers": total_count - mapped_count,
            "coverage_ratio": round(mapped_count / total_count, 6) if total_count else 0,
            "observed_source_keys": len(usage),
            "mapped_source_keys": sum(bool(mappings.get(key, {}).get("field_ids")) for key in usage),
            "intentionally_unmapped_source_keys": sum(
                bool(mappings.get(key, {}).get("intentionally_unmapped")) for key in usage
            ),
            "unmatched_source_keys": sum(key not in mappings for key in usage),
            "unused_mapping_keys": len(unused_mappings),
        },
        "field_counts": [
            {"field_id": field_id, "name": catalog[field_id], "researcher_count": len(field_counts[field_id])}
            for field_id in sorted(catalog)
        ],
        "unmapped_researchers": unmapped_researchers,
        "unmatched_sources": unmatched_sources,
        "source_keys": source_rows,
        "unused_mapping_keys": unused_mappings,
    }
    output = {
        "source": "data/researchers.json",
        "mapping": "data/field_map.csv",
        "catalog": "data/fields_catalog.json",
        "researcher_count": total_count,
        "researcher_fields": pairs,
    }
    return output, report


def _markdown(report):
    summary = report["summary"]
    lines = [
        "# Field mapping report", "",
        f"Mapped researchers: {summary['mapped_researchers']}/{summary['total_researchers']} ({summary['coverage_ratio']:.1%})",
        f"Unmapped researchers: {summary['unmapped_researchers']}",
        f"Observed source keys: {summary['observed_source_keys']} (mapped {summary['mapped_source_keys']}, "
        f"intentionally unmapped {summary['intentionally_unmapped_source_keys']}, unmatched {summary['unmatched_source_keys']})",
        f"Unused mapping keys: {summary['unused_mapping_keys']}", "",
        "## Researchers per field", "", "| Field ID | Name | Researchers |", "|---|---|---:|",
    ]
    for field in report["field_counts"]:
        lines.append("| {} | {} | {} |".format(field["field_id"], _mdcell(field["name"]), field["researcher_count"]))
    lines.extend(["", "## Unmapped source keys", "", "| Status | Source kind | Table type | NII code | Path | Source name | Projects | Researchers | Note |", "|---|---|---|---|---|---|---:|---:|---|"])
    for source in report["unmatched_sources"]:
        cells = [source.get(key, "") for key in ("status", "source_kind", "table_type", "nii_code", "path", "source_name")]
        cells.extend([str(source["project_count"]), str(source["researcher_count"]), source.get("reason", "")])
        lines.append("| " + " | ".join(_mdcell(cell) for cell in cells) + " |")
    lines.extend(["", "## Unmapped researchers", "", "| Researcher ID | Name | Source codes |", "|---|---|---|"])
    for researcher in report["unmapped_researchers"]:
        keys = "; ".join(" / ".join(_clean(key.get(name)) for name in SOURCE_FIELDS) for key in researcher["source_keys"])
        lines.append("| {} | {} | {} |".format(
            researcher["researcher_id"], _mdcell(researcher["name"]), _mdcell(keys)))
    return "\n".join(lines) + "\n"


def _mdcell(value):
    return _clean(value).replace("|", "\\|").replace("\n", " ")


def _write_json(path, value):
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def main():
    input_data = json.loads(INPUT_PATH.read_text(encoding="utf-8"))
    researchers = input_data["researchers"]
    catalog = load_catalog()
    mappings = load_mapping(MAPPING_PATH, catalog)
    output, report = build_outputs(researchers, mappings, catalog)
    _write_json(OUTPUT_PATH, output)
    _write_json(REPORT_JSON_PATH, report)
    REPORT_MD_PATH.write_text(_markdown(report), encoding="utf-8")
    print(json.dumps(report["summary"], ensure_ascii=False))


if __name__ == "__main__":
    main()
