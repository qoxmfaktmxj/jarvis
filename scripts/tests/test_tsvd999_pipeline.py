import importlib.util
import argparse
import asyncio
import json
import pathlib
import tempfile
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[2]


def load_script(name: str):
    path = ROOT / "scripts" / name
    spec = importlib.util.spec_from_file_location(name.replace("-", "_"), path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class NormalizeTsvd999Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.normalize = load_script("normalize-tsvd999.py")

    def test_sanitize_text_removes_html_and_person_identifiers(self):
        raw = "<p>홍길동 사번 123456 이메일 hong@example.com 대상자 : X15047 백영훈, X23095 김정원 문의</p>"

        cleaned = self.normalize.sanitize_text(raw)

        self.assertNotIn("<p>", cleaned)
        self.assertNotIn("hong@example.com", cleaned)
        self.assertNotIn("홍길동", cleaned)
        self.assertNotIn("X15047", cleaned)
        self.assertNotIn("백영훈", cleaned)
        self.assertNotIn("김정원", cleaned)
        self.assertIn("[이름]", cleaned)
        self.assertIn("[사번]", cleaned)

    def test_sanitize_text_removes_unicode_replacement_characters(self):
        raw = "font-family: NanumGothic, Dotum, \ufffd\ufffd\ufffd\ufffd, arial;"

        cleaned = self.normalize.sanitize_text(raw)

        self.assertNotIn("\ufffd", cleaned)
        self.assertIn("NanumGothic", cleaned)

    def test_sanitize_text_masks_numeric_employee_ids_and_korean_names(self):
        raw = "근무시간 미적용 배용호(07110501) 확인. 최종윤 주임, 박준범 팀장님, 이호경님 문의"

        cleaned = self.normalize.sanitize_text(raw)

        self.assertNotIn("배용호", cleaned)
        self.assertNotIn("07110501", cleaned)
        self.assertNotIn("최종윤", cleaned)
        self.assertNotIn("박준범", cleaned)
        self.assertNotIn("이호경", cleaned)
        self.assertIn("[이름]", cleaned)
        self.assertIn("[사번]", cleaned)

    def test_sanitize_text_masks_labeled_korean_names(self):
        raw = "대상자 : 윤여진 입니다. 요청자 최현호(010-1234-5678) 확인"

        cleaned = self.normalize.sanitize_text(raw)

        self.assertNotIn("윤여진", cleaned)
        self.assertNotIn("최현호", cleaned)
        self.assertNotIn("010-1234-5678", cleaned)
        self.assertIn("[이름]", cleaned)
        self.assertIn("[전화번호]", cleaned)

    def test_sanitize_text_masks_common_hr_name_contexts(self):
        raw = "최종윤 주임입니다. 최종윤 드림. 이지영 05070401 송지은 17010101 채용발령 (최현호,김재정)건"

        cleaned = self.normalize.sanitize_text(raw)

        for name in ["최종윤", "이지영", "송지은", "최현호", "김재정"]:
            self.assertNotIn(name, cleaned)
        self.assertNotIn("05070401", cleaned)
        self.assertNotIn("17010101", cleaned)
        self.assertIn("[이름]", cleaned)
        self.assertIn("[사번]", cleaned)

    def test_sanitize_text_masks_remaining_person_identifier_patterns(self):
        raw = (
            "윤여진님의 테스트 요청. 최현호 과장님께 전달. 박준범 팀장님이 확인. "
            "배용호_07110501 계정. 31193 / 최현석 담당."
        )

        cleaned = self.normalize.sanitize_text(raw)

        for value in ["윤여진", "최현호", "박준범", "배용호", "최현석", "07110501", "31193"]:
            self.assertNotIn(value, cleaned)
        self.assertIn("[이름]", cleaned)
        self.assertIn("[사번]", cleaned)

    def test_sanitize_text_preserves_common_business_comma_phrases(self):
        raw = "데이터 또는 자료의 확인, 수정, 반영 완료"

        cleaned = self.normalize.sanitize_text(raw)

        self.assertIn("확인, 수정, 반영", cleaned)
        self.assertNotIn("[이름], [이름]", cleaned)

    def test_sanitize_text_preserves_tax_terms_in_comma_phrases(self):
        raw = "정기상여금 소득세, 지방소득세 오정산 및 주민세, 취득세 확인"

        cleaned = self.normalize.sanitize_text(raw)

        self.assertIn("소득세, 지방소득세", cleaned)
        self.assertIn("주민세, 취득세", cleaned)
        self.assertNotIn("[이름]세", cleaned)
        self.assertNotIn("[이름], [이름]세", cleaned)

    def test_sanitize_text_masks_phone_numbers_adjacent_to_korean_text(self):
        raw = "연락처: 010-8872-1890벽산 담당자. P.01076762240문의내용 확인"

        cleaned = self.normalize.sanitize_text(raw)

        self.assertNotIn("010-8872-1890", cleaned)
        self.assertNotIn("01076762240", cleaned)
        self.assertIn("[전화번호]", cleaned)

    def test_sanitize_text_does_not_mask_product_codes_that_contain_phone_like_digits(self):
        raw = "자재 11668169101-02-083291 및 3023021030230215 확인"

        cleaned = self.normalize.sanitize_text(raw)

        self.assertIn("11668169101-02-083291", cleaned)
        self.assertIn("3023021030230215", cleaned)
        self.assertNotIn("[전화번호]", cleaned)

    def test_sanitize_text_masks_compact_person_lists_from_exported_cases(self):
        raw = (
            "[전화번호] 최현호. 최현석([사번]). 심슬기, 윤여진은 내역 없음. "
            "HD현대이엔티 인사총무팀 윤여진 [이름]입니다. "
            "배용호_07110501중간점검등록. (사번/성명)31193 / 최현석31621 / 송준훈. "
            "mat 박준범 사원전체. 이지영 05070401송지은 17010101"
        )

        cleaned = self.normalize.sanitize_text(raw)

        for value in [
            "최현호",
            "최현석",
            "심슬기",
            "윤여진",
            "배용호",
            "박준범",
            "이지영",
            "송지은",
            "07110501",
            "05070401",
            "17010101",
            "31193",
            "31621",
        ]:
            self.assertNotIn(value, cleaned)
        self.assertIn("[이름]", cleaned)
        self.assertIn("[사번]", cleaned)

    def test_sanitize_text_masks_names_glued_to_hr_context_terms(self):
        raw = (
            "DC20256 김웅태최현호([전화번호]). 2202 최현석업적결과업로드. "
            "윤여진 활동 결과. 윤여진 님 근태 승인. 45박준범님의 경우. "
            "31341 / 박준범근로소득간이세액표. 경영지원실 배용호 - 이재서. "
            "상위부서인 경영지원실(배용호) 결재선"
        )

        cleaned = self.normalize.sanitize_text(raw)

        for value in ["김웅태", "최현호", "최현석", "윤여진", "박준범", "배용호", "31341"]:
            self.assertNotIn(value, cleaned)
        self.assertIn("[이름]", cleaned)
        self.assertIn("[사번]", cleaned)

    def test_sanitize_text_masks_names_before_mixed_language_department_and_role(self):
        raw = "유영훈 America수출파트 사원 박준범 EMEA수출파트 대리 김기현 EMEA수출파트 대리"

        cleaned = self.normalize.sanitize_text(raw)

        for value in ["유영훈", "박준범", "김기현"]:
            self.assertNotIn(value, cleaned)
        self.assertIn("[이름]", cleaned)
        self.assertIn("[직급]", cleaned)

    def test_build_import_record_maps_oracle_row_without_llm_noise(self):
        row = {
            "ENTER_CD": "ISU",
            "YYYY": "2026",
            "MM": "04",
            "SEQ": "42",
            "HIGHER_NM": "OPTI-HR",
            "LOWER_NM": "근태관리",
            "APP_MENU": "근태관리>근태신청",
            "PROCESS_NM": "요청사항 확인 및 안내",
            "TITLE": "연장근무 신청 문의" * 50,
            "REQUEST_COMPANY_NM": "고객사A",
            "MANAGER_DEPT_NM": "HR서비스팀",
            "SOLUTION_FLAG": "Y",
            "PROCESS_SPEED": "N",
            "WORK_TIME": "1.5",
            "REGISTER_DATE": "2026-04-13 10:11:12",
            "COMPLETE_DATE": "2026-04-13 11:00:00",
        }
        extracted = {
            "symptom": "연장근무 신청 경로를 문의했다.",
            "cause": None,
            "action": "근태신청 메뉴를 안내했다.",
            "result": "resolved",
            "severity": "medium",
            "tags": ["근태", "연장근무"],
        }

        record = self.normalize.build_import_record(row, extracted)

        self.assertEqual(record["source_key"], "ISU/2026/04/42")
        self.assertEqual(record["original_seq"], 42)
        self.assertEqual(record["higher_category"], "OPTI-HR")
        self.assertEqual(record["lower_category"], "근태관리")
        self.assertLessEqual(len(record["title"]), 500)
        self.assertTrue(record["resolved"])
        self.assertFalse(record["urgency"])
        self.assertEqual(record["work_hours"], 1.5)
        self.assertEqual(record["requested_at"], "2026-04-13T10:11:12+09:00")
        self.assertEqual(record["tags"], ["근태", "연장근무"])

    def test_build_source_key_prefers_oracle_rowid_then_rn(self):
        with_rowid = {
            "ORACLE_ROWID": "AAABBB+CCC/DDDFFF",
            "RN": "123",
            "ENTER_CD": "ISU",
            "YYYY": "2026",
            "MM": "04",
            "SEQ": "42",
        }
        with_rn_only = {
            "RN": "123",
            "ENTER_CD": "ISU",
            "YYYY": "2026",
            "MM": "04",
            "SEQ": "42",
        }

        self.assertEqual(
            self.normalize.build_source_key(with_rowid),
            "tsvd999/rowid/AAABBB+CCC/DDDFFF",
        )
        self.assertEqual(
            self.normalize.build_source_key(with_rn_only),
            "tsvd999/rn/123",
        )

    def test_empty_case_short_circuits_without_llm(self):
        row = {
            "TITLE": "빈 문의",
            "CONTENT_TEXT": "  ",
            "COMPLETE_TEXT": "",
            "COMPLETE_CONTENT1": "",
        }

        extracted = self.normalize.extract_empty_case(row)

        self.assertEqual(extracted["result"], "info_only")
        self.assertEqual(extracted["severity"], "low")
        self.assertIsNone(extracted["symptom"])

    def test_load_done_keys_only_uses_source_key(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = pathlib.Path(tmp) / "normalized.jsonl"
            path.write_text(
                '{"source_key":"ISU/2026/04/42","original_seq":42}\n'
                '{"original_seq":43}\n',
                encoding="utf-8",
            )

            done = self.normalize.load_done_keys(path)

            self.assertIn("ISU/2026/04/42", done)
            self.assertNotIn("seq:43", done)

    def test_require_openai_api_key_rejects_missing_or_placeholder(self):
        self.assertIsNone(self.normalize.validate_openai_api_key(None))
        self.assertIsNone(self.normalize.validate_openai_api_key("sk-local-placeholder"))
        self.assertEqual(
            self.normalize.validate_openai_api_key("sk-real-looking"),
            "sk-real-looking",
        )


class ClusterCasesTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cluster = load_script("cluster-cases.py")

    def test_select_digest_case_chooses_nearest_to_centroid(self):
        records = [
            {"id": "a", "embedding": [0.0, 0.0]},
            {"id": "b", "embedding": [1.0, 1.0]},
            {"id": "c", "embedding": [0.4, 0.4]},
        ]

        digest = self.cluster.select_digest_case(records)

        self.assertEqual(digest["id"], "c")

    def test_write_cluster_json_preserves_korean_labels(self):
        payload = [{"cluster_id": 1, "label": "근태 신청 오류", "case_count": 2}]
        encoded = self.cluster.dumps_json(payload)

        self.assertIn("근태 신청 오류", encoded)
        self.assertEqual(json.loads(encoded)[0]["cluster_id"], 1)

    def test_read_jsonl_accepts_utf8_bom(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = pathlib.Path(tmp) / "cases.jsonl"
            path.write_text('{"title":"근태"}\n', encoding="utf-8-sig")

            records = self.cluster.read_jsonl(path)

            self.assertEqual(records[0]["title"], "근태")

    def test_fallback_clustering_does_not_require_embeddings(self):
        records = [
            {
                "original_seq": 1,
                "lower_category": "근태관리",
                "process_type": "오류 수정",
                "app_menu": "근태관리>신청",
                "symptom": "버튼 미노출",
                "action": "권한 확인",
                "tags": ["근태"],
            },
            {
                "original_seq": 2,
                "lower_category": "근태관리",
                "process_type": "오류 수정",
                "app_menu": "근태관리>신청",
                "symptom": "버튼 오류",
                "action": "권한 안내",
                "tags": ["근태"],
            },
        ]
        args = argparse.Namespace(
            method="fallback",
            allow_fallback=True,
            label_with_llm=False,
            embed_model="text-embedding-3-small",
            label_model="gpt-5.4-mini",
            dimensions=1536,
            concurrency=1,
            min_cluster_size=5,
            min_samples=3,
        )

        clusters = asyncio.run(self.cluster.build_clusters(records, args))

        self.assertEqual(len(clusters), 1)
        self.assertEqual(clusters[0]["case_count"], 2)
        self.assertTrue(records[0]["is_digest"])

    def test_cluster_records_include_digest_source_key(self):
        records = [
            {
                "source_key": "tsvd999/rowid/A",
                "original_seq": 10,
                "lower_category": "permission",
                "process_type": "guide",
                "app_menu": "admin",
                "symptom": "button hidden",
                "action": "check permission",
                "tags": ["permission"],
            },
            {
                "source_key": "tsvd999/rowid/B",
                "original_seq": 11,
                "lower_category": "permission",
                "process_type": "guide",
                "app_menu": "admin",
                "symptom": "menu hidden",
                "action": "add role",
                "tags": ["permission"],
            },
        ]
        args = argparse.Namespace(
            method="fallback",
            allow_fallback=True,
            label_with_llm=False,
            embed_model="text-embedding-3-small",
            label_model="gpt-5.4-mini",
            dimensions=1536,
            concurrency=1,
            min_cluster_size=5,
            min_samples=3,
        )

        clusters = asyncio.run(self.cluster.build_clusters(records, args))

        self.assertEqual(clusters[0]["digest_source_key"], "tsvd999/rowid/A")

    def test_fallback_cluster_ids_are_stable_for_input_order(self):
        records = [
            {
                "source_key": "tsvd999/rowid/B",
                "original_seq": None,
                "lower_category": "급여",
                "process_type": "안내",
                "app_menu": "급여>조회",
                "symptom": "조회 문의",
                "action": "메뉴 안내",
                "tags": ["급여"],
            },
            {
                "source_key": "tsvd999/rowid/A",
                "original_seq": None,
                "lower_category": "근태",
                "process_type": "안내",
                "app_menu": "근태>신청",
                "symptom": "신청 문의",
                "action": "메뉴 안내",
                "tags": ["근태"],
            },
        ]
        args = argparse.Namespace(
            method="fallback",
            allow_fallback=True,
            label_with_llm=False,
            embed_model="text-embedding-3-small",
            label_model="gpt-5.4-mini",
            dimensions=1536,
            concurrency=1,
            min_cluster_size=5,
            min_samples=3,
        )

        first = asyncio.run(self.cluster.build_clusters([dict(record) for record in records], args))
        second = asyncio.run(self.cluster.build_clusters([dict(record) for record in reversed(records)], args))

        self.assertEqual(first, second)


if __name__ == "__main__":
    unittest.main()
