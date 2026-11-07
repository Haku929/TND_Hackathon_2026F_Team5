import json
from pathlib import Path
import tempfile
import unittest
from urllib.error import HTTPError, URLError

import fetch_kaken as kaken


UNIVERSITY = "\u7acb\u547d\u9928\u5927\u5b66"
DEPARTMENT = "\u751f\u547d\u79d1\u5b66\u7814\u7a76\u79d1"
PROJECT_XML = f'''<?xml version="1.0" encoding="UTF-8"?>
<grantAwards><totalResults>1</totalResults><startIndex>1</startIndex><itemsPerPage>1</itemsPerPage>
  <grantAward id="KAKENHI-PLANNED-00000001" awardNumber="24K00001">
    <researcherNumber type="erad">87654321</researcherNumber>
    <grantAwardInfo xml:lang="ja" parentId="KAKENHI-PROJECT-IGNORED" />
    <summary xml:lang="ja">
      <awardNumber awardNumber="24K00001" />
      <projectStatus statusCode="discontinued" fiscalYear="2025" />
      <review_section niiCode="01010" tableType="large">Law</review_section>
      <field niiCode="01010" fieldTable="old-table" path="/law/">Law</field>
    </summary>
    <summary xml:lang="en">
      <title>English project title</title><keywordList><keyword>English keyword</keyword></keywordList>
      <paragraphList type="outline_of_research_initial"><paragraph>English abstract</paragraph></paragraphList>
    </summary>
    <grantList>
      <grant xml:lang="ja" fiscalYear="2024"><periodOfAward searchStartFiscalYear="2024" searchEndFiscalYear="2026">2024-2026</periodOfAward></grant>
      <grant xml:lang="ja" fiscalYear="2025"><periodOfAward searchStartFiscalYear="2024" searchEndFiscalYear="2026">2024-2026</periodOfAward></grant>
    </grantList>
    <memberList>
      <member xml:lang="ja" id="MEMBER-12345678" role="principal_investigator">
        <personalName><fullName>Researcher A</fullName></personalName>
        <attribute><affiliation><institution>{UNIVERSITY}</institution><department>{DEPARTMENT}</department><jobTitle>Professor</jobTitle></affiliation></attribute>
      </member>
      <member xml:lang="en" id="MEMBER-12345678" role="principal_investigator"><personalName><fullName>Researcher A</fullName></personalName></member>
      <member xml:lang="ja" id="MEMBER-2" role="principal_investigator"><personalName><fullName>No ID</fullName></personalName></member>
    </memberList>
  </grantAward>
</grantAwards>'''.encode("utf-8")


class FetchKakenTests(unittest.TestCase):
    def test_project_parser_fallback_ids_affiliations_and_legacy_fields(self):
        page = kaken.parse_project_page(PROJECT_XML)
        self.assertEqual((page["total_results"], page["start_index"], page["items_per_page"]), (1, 1, 1))
        project = page["records"][0]
        self.assertEqual(project["id"], "KAKENHI-PLANNED-00000001")
        self.assertEqual(project["award_number"], "24K00001")
        self.assertEqual((project["title"], project["title_language"]), ("English project title", "en"))
        self.assertEqual((project["abstract"], project["abstract_language"]), ("English abstract", "en"))
        self.assertEqual(project["review_sections"][0]["code"], "01010")
        self.assertEqual(project["research_fields"][0]["table_type"], "old-table")
        self.assertEqual(project["research_fields"][0]["path"], "/law/")
        self.assertEqual(len(project["periods"]), 2)
        self.assertEqual([member["id"] for member in project["members"]], ["12345678", None])
        self.assertEqual(project["members"][0]["recorded_affiliations"], [f"{UNIVERSITY} {DEPARTMENT} Professor"])

    def test_english_only_members_are_used(self):
        award = kaken.ET.fromstring(f'''<grantAward><memberList><member xml:lang="en" id="MEMBER-12345678">
          <personalName><fullName>English Name</fullName></personalName></member></memberList></grantAward>''')
        self.assertEqual(kaken._parse_members(award)[0]["name"], "English Name")

    def test_current_profile_is_authoritative_and_only_declined_is_excluded(self):
        project = kaken.parse_project_page(PROJECT_XML)["records"][0]
        profile = {"id": "12345678", "name": "Current Name", "current_affiliations": [
            {"institution": UNIVERSITY, "department": DEPARTMENT, "job_title": "Professor"}
        ]}
        grouped, stats = kaken.group_researchers([project], {"researchers": [profile]})
        self.assertEqual(grouped[0]["name"], "Current Name")
        self.assertEqual(grouped[0]["projects"][0]["recorded_affiliations"], [f"{UNIVERSITY} {DEPARTMENT} Professor"])
        self.assertEqual(stats["current_ritsumeikan_with_queried_projects"], 1)
        project["statuses"] = [{"code": "declined", "fiscal_year": "2025"}]
        self.assertEqual(kaken.group_researchers([project], {"researchers": [profile]})[0], [])

    def test_researcher_parser_and_complete_page_plan(self):
        body = json.dumps({"totalResults": 1, "startIndex": 1, "itemsPerPage": 1, "researchers": [{
            "id:person:erad": "12345678", "name": {"humanReadableValue": [{"lang": "ja", "text": "Name"}]},
            "affiliations:current": [{"affiliation:institution": {"humanReadableValue": [{"lang": "ja", "text": UNIVERSITY}]}}]
        }]}).encode()
        profile = kaken.parse_researcher_page(body)["records"][0]
        self.assertEqual(profile["current_affiliations"][0]["institution"], UNIVERSITY)
        self.assertEqual(kaken.researcher_page_queries(2925), [
            (2, 1), (2, 501), (2, 1000), (3, 1), (3, 501), (3, 1000),
            (4, 1), (4, 501), (4, 1000), (5, 1), (5, 501), (5, 1000),
            (6, 1), (6, 501), (6, 1000), (7, 1), (7, 501), (7, 1000)
        ])
        with self.assertRaises(kaken.FetchError):
            kaken.researcher_page_queries(8995)

    @staticmethod
    def _profile_record(number):
        return {
            "id:person:erad": f"{number:08d}",
            "name": {"humanReadableValue": [{"lang": "ja", "text": "Researcher"}]},
            "affiliations:current": [{"affiliation:institution": {
                "humanReadableValue": [{"lang": "ja", "text": UNIVERSITY}]
            }}],
        }

    def test_researcher_fallback_orders_fill_gap_and_stop(self):
        total = 1500

        class MockClient:
            _appid = ""

            def __init__(self, include_missing):
                self.calls = []
                base = list(range(1, total + 1))
                self.orders = {order: list(base) for order in (2, 3, 4, 5, 6, 7)}
                if include_missing:
                    self.orders[6] = [total, *range(1, total)]

            def get(self, endpoint, params):
                order, start, rw = int(params["od"]), int(params["st"]), int(params["rw"])
                self.calls.append((order, start))
                records = [FetchKakenTests._profile_record(number) for number in self.orders[order][start - 1:start - 1 + rw]]
                body = json.dumps({"totalResults": total, "startIndex": start, "itemsPerPage": rw,
                                   "researchers": records}).encode()
                return body, body, "", "application/json"

        with tempfile.TemporaryDirectory() as directory:
            client = MockClient(include_missing=True)
            current_map, stats = kaken.fetch_current_profiles(client, Path(directory), offline=False)
        self.assertEqual(len(current_map["researchers"]), total)
        self.assertEqual(client.calls[-1], (6, 1))
        self.assertEqual(len(client.calls), 13)
        self.assertEqual(current_map["metadata"]["query"]["od"], [2, 3, 4, 5, 6])
        self.assertEqual(stats["unique_researchers"], total)

        with tempfile.TemporaryDirectory() as directory:
            client = MockClient(include_missing=False)
            with self.assertRaises(kaken.FetchError) as error:
                kaken.fetch_current_profiles(client, Path(directory), offline=False)
        self.assertEqual(error.exception.error_type, "IncompleteResearcherCoverage")
        self.assertEqual(len(client.calls), 18)

    def test_page_validation_accepts_full_limit_metadata_on_short_final_page(self):
        page = {"start_index": 5501, "items_per_page": 500, "total_results": 5860, "records": [{}] * 360}
        kaken._validate_page(page, {"st": 5501, "rw": 500})
        page["records"] = page["records"][:-1]
        with self.assertRaises(kaken.FetchError):
            kaken._validate_page(page, {"st": 5501, "rw": 500})

    def test_cache_integrity_and_missing_page_detection(self):
        params = {"format": "json", "rw": 1, "st": 1, "qe": "test"}
        parsed = {"total_results": 1, "start_index": 1, "items_per_page": 1, "records": [{}]}

        class Client:
            _appid = ""

            def get(self, endpoint, query):
                return b"{}", b"{}", "", "application/json"

        with tempfile.TemporaryDirectory() as directory:
            cache = Path(directory)
            parser = lambda _: parsed
            kaken._get_page(Client(), cache, "test", "https://example.invalid/", params, "json", parser, False)
            self.assertEqual(kaken._read_cached_page(cache, "test", params, "json", parser), parsed)
            stem = kaken._cache_stem(cache, "test", params)
            metadata = json.loads(stem.with_name(stem.name + ".meta.json").read_text(encoding="utf-8"))
            (cache / metadata["body_file"]).write_bytes(b"tampered")
            with self.assertRaises(kaken.FetchError) as error:
                kaken._read_cached_page(cache, "test", params, "json", parser)
            self.assertEqual(error.exception.error_type, "CacheHashMismatch")
            (cache / metadata["body_file"]).unlink()
            with self.assertRaises(kaken.FetchError) as error:
                kaken._read_cached_page(cache, "test", params, "json", parser)
            self.assertEqual(error.exception.error_type, "IncompleteCache")

    def test_api_credential_parser_redaction_and_bounded_retry(self):
        with tempfile.TemporaryDirectory() as directory:
            env_path = Path(directory) / ".env"
            env_path.write_text('KAKEN_APPID="test-secret"\n', encoding="utf-8")
            self.assertEqual(kaken.load_appid({}, env_path), "test-secret")

        class FailingOpener:
            calls = 0

            def open(self, request, timeout):
                self.calls += 1
                raise HTTPError(request.full_url, 429, "rate limited", {}, None)

        sleeps = []
        opener = FailingOpener()
        client = kaken.ApiClient("test-secret", opener=opener, sleep=sleeps.append, clock=lambda: 0)
        with self.assertRaises(kaken.FetchError) as error:
            client.get("https://kaken.nii.ac.jp/opensearch/", {"qe": "x"})
        self.assertEqual(error.exception.status, 429)
        self.assertEqual(opener.calls, 2)
        self.assertIn(kaken.RETRY_DELAY, sleeps)
        self.assertNotIn("test-secret", str(error.exception))
        self.assertNotIn("test-secret", str(sleeps))


if __name__ == "__main__":
    unittest.main()
