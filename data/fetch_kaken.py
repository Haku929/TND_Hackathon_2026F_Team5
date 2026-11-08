"""Download KAKEN project pages and group only currently affiliated researchers."""

from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener
import xml.etree.ElementTree as ET


ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data" / "raw"
ENV_PATH = ROOT / ".env"
PROJECTS_URL = "https://kaken.nii.ac.jp/opensearch/"
RESEARCHERS_URL = "https://nrid.nii.ac.jp/opensearch/"
UNIVERSITY = "立命館大学"
XML_LANG = "{http://www.w3.org/XML/1998/namespace}lang"
PAGE_SIZE = 500
MAX_RESEARCHER_START = 1000
MIN_REQUEST_INTERVAL = 1.05
RETRY_DELAY = 10
REQUEST_TIMEOUT = 60
PROJECT_QUERY = {"qe": UNIVERSITY, "format": "xml", "rw": PAGE_SIZE, "lang": "ja", "od": 2}


class FetchError(Exception):
    def __init__(self, error_type: str, status: int | None = None):
        super().__init__(error_type)
        self.error_type = error_type
        self.status = status


class _SameHostHTTPSRedirectHandler(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        source, target = urlsplit(req.full_url), urlsplit(newurl)
        if target.scheme != "https" or target.hostname != source.hostname:
            raise URLError("unsafe redirect")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def load_appid(env=None, env_path: Path = ENV_PATH) -> str:
    environment = os.environ if env is None else env
    value = str(environment.get("KAKEN_APPID", "")).strip()
    if value:
        return value
    try:
        lines = env_path.read_text(encoding="utf-8-sig").splitlines()
    except OSError:
        lines = []
    for line in lines:
        key, separator, value = line.strip().partition("=")
        if separator and key.strip() == "KAKEN_APPID":
            value = value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                value = value[1:-1]
            if value:
                return value
    raise FetchError("MissingKakenAppId")


def _contains_secret(data: bytes, appid: str) -> bool:
    if not appid:
        return False
    candidates = (appid.encode("utf-8"), urlencode({"v": appid}).split("=", 1)[1].encode("ascii"))
    lowered = data.lower()
    return any(value and value.lower() in lowered for value in candidates)


class ApiClient:
    def __init__(self, appid: str, opener=None, sleep=time.sleep, clock=time.monotonic):
        self._appid = appid
        self._opener = opener or build_opener(_SameHostHTTPSRedirectHandler())
        self._sleep = sleep
        self._clock = clock
        self._last_request = None

    def get(self, endpoint: str, params: dict) -> tuple[bytes, bytes, str, str]:
        if "appid" in params:
            raise ValueError("appid belongs to the API client")
        query = urlencode({**params, "appid": self._appid})
        request = Request(
            f"{endpoint}?{query}",
            headers={"Accept-Encoding": "gzip", "User-Agent": "TND-Hackathon-KAKEN-fetch/1.0"},
        )
        for attempt in range(2):
            if self._last_request is not None:
                wait = MIN_REQUEST_INTERVAL - (self._clock() - self._last_request)
                if wait > 0:
                    self._sleep(wait)
            self._last_request = self._clock()
            try:
                with self._opener.open(request, timeout=REQUEST_TIMEOUT) as response:
                    status = response.status
                    raw = response.read()
                    content_type = response.headers.get("Content-Type", "")
                    content_encoding = response.headers.get("Content-Encoding", "").strip().lower()
            except HTTPError as error:
                if error.code in {403, 429} and attempt == 0:
                    self._sleep(RETRY_DELAY)
                    continue
                raise FetchError("HttpError", error.code) from None
            except URLError as error:
                raise FetchError(type(error).__name__) from None
            except Exception as error:
                raise FetchError(type(error).__name__) from None
            if status != 200:
                raise FetchError("HttpError", status)
            if content_encoding in {"", "identity"}:
                decoded = raw
                content_encoding = ""
            elif content_encoding == "gzip":
                try:
                    decoded = gzip.decompress(raw)
                except Exception as error:
                    raise FetchError(type(error).__name__) from None
            else:
                raise FetchError("UnsupportedContentEncoding")
            if _contains_secret(raw, self._appid) or _contains_secret(decoded, self._appid):
                raise FetchError("CredentialEcho")
            if _contains_secret(content_type.encode("utf-8"), self._appid):
                raise FetchError("CredentialEcho")
            return raw, decoded, content_encoding, content_type
        raise FetchError("HttpError", 403)


def _safe_query(params: dict) -> dict[str, str]:
    return {key: str(value) for key, value in sorted(params.items()) if key != "appid"}


def _cache_stem(cache_dir: Path, kind: str, params: dict) -> Path:
    query = {key: value for key, value in params.items() if key != "st"}
    encoded = json.dumps(_safe_query(query), sort_keys=True, ensure_ascii=False).encode("utf-8")
    digest = hashlib.sha256(encoded).hexdigest()[:12]
    return cache_dir / f"{kind}_{digest}_st{int(params['st']):06d}"


def _atomic_write(path: Path, body: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_name(path.name + ".tmp")
    temp_path.write_bytes(body)
    os.replace(temp_path, path)


def _read_cached_page(cache_dir: Path, kind: str, params: dict, fmt: str, parser, appid: str | None = None):
    stem = _cache_stem(cache_dir, kind, params)
    meta_path = stem.with_name(stem.name + ".meta.json")
    if not meta_path.exists():
        if list(cache_dir.glob(stem.name + ".*")):
            raise FetchError("IncompleteCache")
        return None
    try:
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        if meta.get("query") != _safe_query(params) or meta.get("status") != 200:
            raise FetchError("CacheMetadataMismatch")
        encoding = meta.get("content_encoding", "")
        if encoding not in {"", "gzip"}:
            raise FetchError("UnsupportedContentEncoding")
        expected_name = f"{stem.name}.{fmt}{'.gz' if encoding == 'gzip' else ''}"
        if meta.get("body_file") != expected_name:
            raise FetchError("CacheMetadataMismatch")
        body_path = cache_dir / expected_name
        if body_path.parent != cache_dir or not body_path.exists():
            raise FetchError("IncompleteCache")
        raw = body_path.read_bytes()
        if hashlib.sha256(raw).hexdigest() != meta.get("sha256"):
            raise FetchError("CacheHashMismatch")
        decoded = gzip.decompress(raw) if encoding == "gzip" else raw
        if appid and (_contains_secret(raw, appid) or _contains_secret(decoded, appid)):
            raise FetchError("CredentialEcho")
        parsed = parser(decoded)
    except FetchError:
        raise
    except Exception as error:
        raise FetchError(type(error).__name__) from None
    _validate_page(parsed, params)
    for key in ("total_results", "start_index", "items_per_page"):
        if meta.get(key) != parsed[key]:
            raise FetchError("CacheMetadataMismatch")
    return parsed


def _validate_page(page: dict, params: dict) -> None:
    start = int(params["st"])
    rw = int(params["rw"])
    if page["start_index"] != start:
        raise FetchError("InvalidPageMetadata")
    expected_count = min(rw, max(0, page["total_results"] - start + 1))
    if page["items_per_page"] not in {rw, len(page["records"])}:
        raise FetchError("InvalidPageMetadata")
    if len(page["records"]) != expected_count:
        raise FetchError("IncompletePage")


def _get_page(client: ApiClient | None, cache_dir: Path, kind: str, endpoint: str,
              params: dict, fmt: str, parser, offline: bool, appid: str | None = None) -> dict:
    cached = _read_cached_page(cache_dir, kind, params, fmt, parser, appid)
    if cached is not None:
        return cached
    if offline or client is None:
        raise FetchError("CacheMiss")
    raw, decoded, content_encoding, content_type = client.get(endpoint, params)
    parsed = parser(decoded)
    _validate_page(parsed, params)
    stem = _cache_stem(cache_dir, kind, params)
    suffix = f".{fmt}{'.gz' if content_encoding == 'gzip' else ''}"
    body_name = stem.name + suffix
    meta = {
        "query": _safe_query(params),
        "status": 200,
        "content_type": content_type,
        "content_encoding": content_encoding,
        "body_file": body_name,
        "sha256": hashlib.sha256(raw).hexdigest(),
        "total_results": parsed["total_results"],
        "start_index": parsed["start_index"],
        "items_per_page": parsed["items_per_page"],
        "record_count": len(parsed["records"]),
        "retrieved_at": datetime.now(timezone.utc).isoformat(),
    }
    _atomic_write(cache_dir / body_name, raw)
    _atomic_write(stem.with_name(stem.name + ".meta.json"), json.dumps(meta, indent=2).encode("utf-8") + b"\n")
    return parsed


def _int_child(root: ET.Element, name: str) -> int:
    text = root.findtext(name)
    if text is None or not text.strip().isdigit():
        raise FetchError("InvalidPageMetadata")
    return int(text.strip())


def _text(element: ET.Element | None) -> str:
    if element is None:
        return ""
    return " ".join(part.strip() for part in element.itertext() if part.strip())


def _unique(values) -> list[str]:
    return list(dict.fromkeys(value for value in values if value))


def _select_summary(summaries: list[ET.Element]) -> tuple[ET.Element | None, str]:
    for language in ("ja", "en"):
        for summary in summaries:
            if summary.get(XML_LANG) == language and _text(summary.find("title")):
                return summary, language
    for language in ("ja", "en"):
        for summary in summaries:
            if summary.get(XML_LANG) == language:
                return summary, language
    return (summaries[0], summaries[0].get(XML_LANG, "unknown")) if summaries else (None, "unknown")


def _summary_text(summaries: list[ET.Element], tag: str) -> tuple[str, str]:
    for language in ("ja", "en"):
        for summary in summaries:
            if summary.get(XML_LANG) == language:
                value = _text(summary.find(tag))
                if value:
                    return value, language
    return "", "unknown"


def _project_abstract(summaries: list[ET.Element], award: ET.Element) -> tuple[str, str]:
    for language in ("ja", "en"):
        for summary in summaries:
            if summary.get(XML_LANG) != language:
                continue
            blocks = summary.findall("paragraphList")
            blocks.sort(key=lambda node: (node.get("type") != "outline_of_research_initial", node.get("type", "")))
            for block in blocks:
                paragraphs = [_text(item) for item in block.findall("paragraph")]
                abstract = "\n".join(value for value in paragraphs if value)
                if abstract:
                    return abstract, language
    blocks = [block for block in award.findall("paragraphList") if block.get("type", "").startswith("outline_of_research")]
    for block in blocks:
        abstract = "\n".join(_text(item) for item in block.findall("paragraph") if _text(item))
        if abstract:
            return abstract, "ja"
    return "", "unknown"


def _project_keywords(summaries: list[ET.Element], award: ET.Element) -> tuple[list[str], str]:
    for language in ("ja", "en"):
        for summary in summaries:
            if summary.get(XML_LANG) != language:
                continue
            lists = summary.findall("keywordList")
            words = _unique(_text(keyword) for group in lists for keyword in group.findall("keyword"))
            if words:
                return words, language
    words = _unique(_text(keyword) for group in award.findall("keywordList") for keyword in group.findall("keyword"))
    return words, "ja" if words else "unknown"


def _member_id(member: ET.Element) -> str | None:
    value = member.get("eradCode", "").strip()
    if not re.fullmatch(r"\d{8}", value):
        match = re.fullmatch(r"MEMBER-(\d{8})", member.get("id", ""))
        value = match.group(1) if match else ""
    if not value:
        value = next(
            (_text(number) for number in member.iter("researcherNumber")
             if number.get("type") == "erad" and re.fullmatch(r"\d{8}", _text(number))),
            "",
        )
    return value or None


def _parse_members(award: ET.Element) -> list[dict]:
    nodes = award.findall("./memberList/member")
    japanese = [node for node in nodes if node.get(XML_LANG) == "ja"]
    selected = japanese or [node for node in nodes if node.get(XML_LANG) in {None, "en", "en-US"}]
    members = []
    seen = set()
    for member in selected:
        name = _text(member.find("./personalName/fullName"))
        if not name:
            name = " ".join(filter(None, (_text(member.find("./personalName/familyName")), _text(member.find("./personalName/givenName")))))
        recorded = _unique(_text(node) for node in member.findall("attribute"))
        if not recorded:
            pieces = [_text(member.find(tag)) for tag in ("institution", "department", "jobTitle")]
            recorded = [" ".join(piece for piece in pieces if piece)] if any(pieces) else []
        record = {
            "id": _member_id(member),
            "source_member_id": member.get("id", ""),
            "name": name,
            "role": member.get("role", ""),
            "recorded_affiliations": recorded,
        }
        signature = (record["id"], record["source_member_id"], record["role"], tuple(recorded), name)
        if signature not in seen:
            seen.add(signature)
            members.append(record)
    return members


def parse_project(award: ET.Element) -> dict:
    summaries = award.findall("summary")
    summary, _ = _select_summary(summaries)
    info = next((node for node in award.findall("grantAwardInfo") if node.get(XML_LANG) == "ja"), None)
    if info is None:
        info = award.find("grantAwardInfo")
    project_id = award.get("id", "") or (info.get("parentId", "") if info is not None else "")
    if not project_id.startswith("KAKENHI-"):
        raise FetchError("MissingProjectId")
    award_number = award.get("awardNumber", "").strip()
    if not award_number:
        for source in summaries:
            node = source.find("awardNumber")
            if node is not None:
                award_number = node.get("awardNumber", "").strip() or _text(node)
                if award_number:
                    break
    if not award_number:
        award_number = _text(award.find("./awardNumberList/awardNumber"))
    title, title_language = _summary_text(summaries, "title")
    keywords, keyword_language = _project_keywords(summaries, award)
    abstract, abstract_language = _project_abstract(summaries, award)
    sections = []
    research_fields = []
    for source in summaries:
        if source.get(XML_LANG) not in {"ja", "en"}:
            continue
        language = source.get(XML_LANG)
        for section in source.findall("review_section"):
            entry = {
                "code": str(section.get("niiCode", "")),
                "name": _text(section),
                "table_type": str(section.get("tableType", "")),
                "language": language,
            }
            if entry["code"] and entry["name"] and entry not in sections:
                sections.append(entry)
        for field in source.findall("field"):
            entry = {
                "code": str(field.get("niiCode", "")),
                "table_type": str(field.get("fieldTable", "")),
                "path": str(field.get("path", "")),
                "name": _text(field),
                "language": language,
            }
            if any(entry[key] for key in ("code", "table_type", "path", "name")) and entry not in research_fields:
                research_fields.append(entry)
        if any(section["language"] == "ja" for section in sections):
            sections = [section for section in sections if section["language"] == "ja"]
        if any(field["language"] == "ja" for field in research_fields):
            research_fields = [field for field in research_fields if field["language"] == "ja"]
    status_sources = [node for node in summaries if node.get(XML_LANG) in {"ja", "en"}]
    status_language = "ja" if any(node.get(XML_LANG) == "ja" for node in status_sources) else "en"
    statuses = []
    for source in status_sources:
        if source.get(XML_LANG) != status_language:
            continue
        for node in source.findall("projectStatus"):
            status = {"code": str(node.get("statusCode", "")), "fiscal_year": str(node.get("fiscalYear", ""))}
            if status["code"] and status not in statuses:
                statuses.append(status)
    institutions = _unique(
        _text(node)
        for source in summaries if source.get(XML_LANG) == "ja"
        for node in source.findall("institution")
    )
    if not institutions:
        institutions = _unique(_text(node) for node in award.iter("institution"))
    periods = []
    for grant in award.findall("./grantList/grant"):
        if grant.get(XML_LANG) not in {"ja", None}:
            continue
        period = grant.find("periodOfAward")
        if period is not None:
            entry = {
                "fiscal_year": str(grant.get("fiscalYear", "")),
                "start_year": str(period.get("searchStartFiscalYear", "")),
                "end_year": str(period.get("searchEndFiscalYear", "")),
                "dates": _text(period),
            }
            if entry not in periods:
                periods.append(entry)
    url = _text(award.find("./urlList/url"))
    return {
        "id": project_id,
        "award_number": award_number,
        "url": url,
        "title": title,
        "title_language": title_language,
        "keywords": keywords,
        "keywords_language": keyword_language,
        "abstract": abstract,
        "abstract_language": abstract_language,
        "review_sections": sections,
        "research_fields": research_fields,
        "statuses": statuses,
        "institutions": institutions,
        "periods": periods,
        "members": _parse_members(award),
    }


def parse_project_page(body: bytes) -> dict:
    try:
        root = ET.fromstring(body)
    except ET.ParseError as error:
        raise FetchError("MalformedXml") from None
    if root.tag != "grantAwards":
        raise FetchError("InvalidXmlRoot")
    records = [parse_project(award) for award in root.findall("grantAward")]
    return {
        "total_results": _int_child(root, "totalResults"),
        "start_index": _int_child(root, "startIndex"),
        "items_per_page": _int_child(root, "itemsPerPage"),
        "records": records,
    }


def _hrv(value: dict | None) -> list[str]:
    if not isinstance(value, dict):
        return []
    human = value.get("humanReadableValue")
    if isinstance(human, str):
        return [human]
    if isinstance(human, list):
        preferred = [entry.get("text", "").strip() for entry in human if isinstance(entry, dict) and entry.get("lang") == "ja"]
        return _unique(preferred or [entry.get("text", "").strip() for entry in human if isinstance(entry, dict)])
    return []


def _record_id(record: dict) -> str | None:
    value = record.get("id:person:erad")
    if isinstance(value, list):
        value = next((str(item).strip() for item in value if str(item).strip()), "")
    else:
        value = str(value or "").strip()
    return value if re.fullmatch(r"\d{8}", value) else None


def _current_profile(record: dict) -> dict | None:
    researcher_id = _record_id(record)
    if researcher_id is None:
        return None
    names = _hrv(record.get("name"))
    current = record.get("affiliations:current") or []
    if isinstance(current, dict):
        current = [current]
    affiliations = []
    for item in current:
        if not isinstance(item, dict):
            continue
        institutions = _hrv(item.get("affiliation:institution"))
        departments = _hrv(item.get("affiliation:department"))
        job_titles = _hrv(item.get("affiliation:jobTitle"))
        entry = {
            "institution": institutions[0] if institutions else "",
            "department": departments[0] if departments else "",
            "job_title": job_titles[0] if job_titles else "",
        }
        if entry["institution"] and entry not in affiliations:
            affiliations.append(entry)
    return {"id": researcher_id, "name": names[0] if names else "", "current_affiliations": affiliations}


def parse_researcher_page(body: bytes) -> dict:
    try:
        payload = json.loads(body)
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise FetchError("MalformedJson") from None
    if not isinstance(payload, dict) or not isinstance(payload.get("researchers"), list):
        raise FetchError("InvalidJsonRoot")
    profiles = []
    for record in payload["researchers"]:
        profile = _current_profile(record)
        if profile is None:
            raise FetchError("MissingResearcherId")
        profiles.append(profile)
    return {
        "total_results": int(payload.get("totalResults", -1)),
        "start_index": int(payload.get("startIndex", -1)),
        "items_per_page": int(payload.get("itemsPerPage", -1)),
        "records": profiles,
    }


def researcher_page_queries(total: int, page_size: int = PAGE_SIZE) -> list[tuple[int, int]]:
    max_coverage = 6 * (MAX_RESEARCHER_START + page_size - 1)
    if total > max_coverage:
        raise FetchError("ResearcherSearchNeedsPartition")
    if total <= 0:
        return []
    starts = [start for start in (1, page_size + 1, MAX_RESEARCHER_START) if start <= total]
    orders = (2, 3, 4, 5, 6, 7) if total > MAX_RESEARCHER_START + page_size - 1 else (2,)
    return [(order, start) for order in orders for start in starts]


def fetch_current_profiles(client: ApiClient | None, cache_dir: Path = RAW_DIR, offline: bool = False) -> tuple[dict, dict]:
    base = {"qh": UNIVERSITY, "format": "json", "rw": PAGE_SIZE, "lang": "ja", "od": 2, "st": 1}
    first = _get_page(client, cache_dir, "researchers", RESEARCHERS_URL, base, "json", parse_researcher_page, offline,
                      client._appid if client else None)
    total = first["total_results"]
    if total < 0:
        raise FetchError("InvalidResultCount")
    queries = researcher_page_queries(total)
    pages = {}
    profiles = {}
    for order, start in [(2, 1), *queries]:
        if (order, start) in pages:
            continue
        if order == 2 and start == 1:
            page = first
        else:
            params = {"qh": UNIVERSITY, "format": "json", "rw": PAGE_SIZE, "lang": "ja", "od": order, "st": start}
            page = _get_page(client, cache_dir, "researchers", RESEARCHERS_URL, params, "json",
                             parse_researcher_page, offline, client._appid if client else None)
        if page["total_results"] != total:
            raise FetchError("ResearcherTotalChanged")
        if len(page["records"]) != len({profile["id"] for profile in page["records"]}):
            raise FetchError("DuplicateResearcherWithinPage")
        for profile in page["records"]:
            old = profiles.get(profile["id"])
            if old is not None and old != profile:
                raise FetchError("ResearcherRecordConflict")
            profiles[profile["id"]] = profile
        pages[(order, start)] = page
        if len(profiles) == total:
            break
    if len(profiles) != total:
        raise FetchError("IncompleteResearcherCoverage")
    current_count = sum(
        any(affiliation["institution"] == UNIVERSITY for affiliation in profile["current_affiliations"])
        for profile in profiles.values()
    )
    metadata = {
        "query": {"qh": UNIVERSITY, "format": "json", "rw": PAGE_SIZE, "lang": "ja",
                  "od": list(dict.fromkeys(order for order, _ in pages))},
        "total_results": total,
        "unique_researchers": len(profiles),
        "current_ritsumeikan": current_count,
        "request_pages": len(pages),
        "request_starts": [{"od": order, "st": start} for order, start in pages],
    }
    current_map = {"metadata": metadata, "researchers": [profiles[key] for key in sorted(profiles)]}
    return current_map, metadata


def fetch_projects(client: ApiClient | None, cache_dir: Path = RAW_DIR, offline: bool = False) -> tuple[list[dict], dict]:
    first_params = {**PROJECT_QUERY, "st": 1}
    first = _get_page(client, cache_dir, "projects", PROJECTS_URL, first_params, "xml", parse_project_page, offline,
                      client._appid if client else None)
    total = first["total_results"]
    if total < 0:
        raise FetchError("InvalidResultCount")
    pages = {1: first}
    for start in range(1 + PAGE_SIZE, total + 1, PAGE_SIZE):
        params = {**PROJECT_QUERY, "st": start}
        pages[start] = _get_page(client, cache_dir, "projects", PROJECTS_URL, params, "xml", parse_project_page,
                                 offline, client._appid if client else None)
    projects = []
    seen = set()
    for start in sorted(pages):
        page = pages[start]
        if page["total_results"] != total:
            raise FetchError("ProjectTotalChanged")
        for project in page["records"]:
            if project["id"] in seen:
                raise FetchError("DuplicateProjectId")
            seen.add(project["id"])
            projects.append(project)
    if len(projects) != total:
        raise FetchError("IncompleteProjectCoverage")
    stats = project_quality(projects)
    meta = {
        "query": PROJECT_QUERY,
        "total_results": total,
        "unique_project_ids": len(seen),
        "request_pages": len(pages),
        **stats,
    }
    return projects, meta


def project_quality(projects: list[dict]) -> dict:
    status_counts = Counter(status["code"] for project in projects for status in project["statuses"])
    return {
        "declined_projects": sum(any(s["code"] == "declined" for s in project["statuses"]) for project in projects),
        "missing_titles": sum(not project["title"] for project in projects),
        "missing_keywords": sum(not project["keywords"] for project in projects),
        "missing_abstracts": sum(not project["abstract"] for project in projects),
        "project_status_counts": dict(sorted(status_counts.items())),
    }


def _current_rits_affiliations(profile: dict) -> list[dict]:
    return [affiliation for affiliation in profile["current_affiliations"] if affiliation["institution"] == UNIVERSITY]


def group_researchers(projects: list[dict], current_map: dict) -> tuple[list[dict], dict]:
    profiles = {profile["id"]: profile for profile in current_map["researchers"]}
    current_ids = {profile_id for profile_id, profile in profiles.items() if _current_rits_affiliations(profile)}
    grouped = {}
    excluded = Counter()
    for project in projects:
        if not project["title"]:
            excluded["project_missing_title"] += 1
            continue
        if any(status["code"] == "declined" for status in project["statuses"]):
            continue
        for member in project["members"]:
            researcher_id = member["id"]
            if not researcher_id:
                excluded["project_member_missing_id"] += 1
                continue
            profile = profiles.get(researcher_id)
            if profile is None:
                excluded["researcher_profile_missing"] += 1
                continue
            if not profile["current_affiliations"]:
                excluded["current_affiliation_unknown"] += 1
                continue
            rits_affiliations = _current_rits_affiliations(profile)
            if not rits_affiliations:
                excluded["current_affiliation_elsewhere"] += 1
                continue
            name = profile["name"] or member["name"]
            if not name:
                excluded["researcher_missing_name"] += 1
                continue
            researcher = grouped.setdefault(researcher_id, {
                "id": researcher_id,
                "name": name,
                "affiliation": _affiliation_text(rits_affiliations),
                "kaken_url": f"https://nrid.nii.ac.jp/ja/nrid/10000{researcher_id}/",
                "projects": [],
                "_projects_by_id": {},
            })
            project_entry = researcher["_projects_by_id"].get(project["id"])
            if project_entry is None:
                project_entry = {key: value for key, value in project.items() if key != "members"}
                project_entry["roles"] = []
                project_entry["recorded_affiliations"] = []
                project_entry["recorded_names"] = []
                researcher["_projects_by_id"][project["id"]] = project_entry
                researcher["projects"].append(project_entry)
            if member["role"] and member["role"] not in project_entry["roles"]:
                project_entry["roles"].append(member["role"])
            for affiliation in member["recorded_affiliations"]:
                if affiliation not in project_entry["recorded_affiliations"]:
                    project_entry["recorded_affiliations"].append(affiliation)
            if member["name"] and member["name"] not in project_entry["recorded_names"]:
                project_entry["recorded_names"].append(member["name"])
    result = []
    for researcher in grouped.values():
        researcher["projects"].sort(key=lambda item: (item["award_number"], item["id"]))
        researcher["theme"] = _researcher_theme(researcher["projects"])
        researcher.pop("_projects_by_id")
        result.append(researcher)
    result.sort(key=lambda item: item["id"])
    excluded["current_ritsumeikan_without_queried_project"] = len(current_ids - set(grouped))
    return result, {
        "current_ritsumeikan_profiles": len(current_ids),
        "current_ritsumeikan_with_queried_projects": len(grouped),
        "excluded_project_members": dict(sorted(excluded.items())),
    }


def _affiliation_text(affiliations: list[dict]) -> str:
    values = []
    for item in affiliations:
        text = " ".join(value for value in (item["institution"], item["department"], item["job_title"]) if value)
        if text and text not in values:
            values.append(text)
    return " / ".join(values)


def _researcher_theme(projects: list[dict]) -> str:
    entries = []
    for project in projects:
        parts = [project["title"]]
        if project["keywords"]:
            parts.append("キーワード: " + "、".join(project["keywords"]))
        if project["abstract"]:
            parts.append("概要: " + project["abstract"])
        entries.append("。".join(part for part in parts if part))
    return "\n".join(entries)


def _write_json(path: Path, value) -> None:
    _atomic_write(path, json.dumps(value, ensure_ascii=False, indent=2).encode("utf-8") + b"\n")


def _main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="KAKEN研究課題を取得し、現在の立命館大学所属者ごとに整理する")
    parser.add_argument("--offline", action="store_true", help="data/raw のキャッシュだけを使う")
    parser.add_argument("--nrid-only", action="store_true", help="研究者ページを集めて現所属数を確認する")
    args = parser.parse_args(argv)
    try:
        appid = load_appid() if not args.offline else None
        client = ApiClient(appid) if appid else None
        current_map, researcher_stats = fetch_current_profiles(client, RAW_DIR, args.offline)
        _write_json(RAW_DIR / "current_researchers.json", current_map)
        if args.nrid_only:
            print(json.dumps({"status": "ok", **researcher_stats}, ensure_ascii=False))
            return 0
        projects, project_stats = fetch_projects(client, RAW_DIR, args.offline)
        _write_json(RAW_DIR / "projects.json", {"metadata": project_stats, "projects": projects})
        researchers, grouping_stats = group_researchers(projects, current_map)
        output = {
            "source": "KAKEN / NRID API",
            "project_query": PROJECT_QUERY,
            "researcher_query": current_map["metadata"]["query"],
            "coverage": {
                "researchers": researcher_stats,
                "projects": project_stats,
                "grouping": grouping_stats,
            },
            "researchers": researchers,
        }
        output_path = ROOT / "data" / "researchers.json"
        _write_json(output_path, output)
        print(json.dumps({
            "status": "ok",
            "projects": len(projects),
            "researchers": len(researchers),
            "output_bytes": output_path.stat().st_size,
            **grouping_stats,
            **{key: project_stats[key] for key in ("declined_projects", "missing_titles", "missing_keywords", "missing_abstracts")},
        }, ensure_ascii=False))
        return 0
    except FetchError as error:
        result = {"status": "error", "error_type": error.error_type}
        if error.status is not None:
            result["http_status"] = error.status
        print(json.dumps(result, ensure_ascii=False))
        return 1
    except Exception as error:
        print(json.dumps({"status": "error", "error_type": type(error).__name__}, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    raise SystemExit(_main())
