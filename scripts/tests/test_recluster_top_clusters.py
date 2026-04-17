import importlib.util
import pathlib
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


def case(source_key: str, cluster_id: int, symptom: str, action: str) -> dict:
    return {
        "source_key": source_key,
        "original_seq": int(source_key.rsplit("-", 1)[-1]),
        "higher_category": "OPTI-HR",
        "lower_category": "근태관리",
        "process_type": "[e-HR] 요청사항 확인 및 안내",
        "title": symptom,
        "symptom": symptom,
        "action": action,
        "cluster_id": cluster_id,
        "cluster_label": f"parent-{cluster_id}",
        "is_digest": False,
        "request_company": "테스트회사",
        "work_hours": 1.0,
    }


class ReclusterTopClustersTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.recluster = load_script("recluster-top-clusters.py")

    def test_selects_only_top_oversized_clusters(self):
        clusters = [
            {"cluster_id": 1, "case_count": 90},
            {"cluster_id": 2, "case_count": 5000},
            {"cluster_id": 3, "case_count": 1200},
            {"cluster_id": 4, "case_count": 1100},
        ]

        selected = self.recluster.select_parent_cluster_ids(
            clusters,
            top_n=2,
            min_parent_size=1000,
        )

        self.assertEqual(selected, {2, 3})

    def test_recluster_preserves_rows_and_parent_lineage(self):
        records = [
            case("case-1", 7, "연장근무 신청 버튼이 보이지 않습니다", "권한을 확인하고 메뉴를 안내했습니다"),
            case("case-2", 7, "연장근무 신청 메뉴가 없습니다", "메뉴 권한을 추가했습니다"),
            case("case-3", 7, "출퇴근 시간이 잘못 계산됩니다", "근무시간 계산 로직을 확인했습니다"),
            case("case-4", 7, "출퇴근 집계가 맞지 않습니다", "집계 데이터를 재생성했습니다"),
            case("case-5", 7, "휴가 신청 상태가 이상합니다", "휴가 신청 데이터를 수정했습니다"),
            case("case-6", 2, "급여 조회 문의", "급여 메뉴를 안내했습니다"),
            case("case-7", 2, "급여명세서 문의", "명세서 조회 경로를 안내했습니다"),
        ]
        clusters = [
            {"cluster_id": 7, "label": "근태관리 / 안내", "case_count": 5},
            {"cluster_id": 2, "label": "급여관리 / 안내", "case_count": 2},
        ]

        result = self.recluster.recluster_top_clusters(
            records,
            clusters,
            parent_cluster_ids={7},
            target_cluster_size=2,
            min_cluster_size=1,
            new_id_start=1000,
            random_state=42,
        )

        self.assertEqual(len(result.records), len(records))
        by_source = {row["source_key"]: row for row in result.records}
        split_ids = {by_source[f"case-{i}"]["cluster_id"] for i in range(1, 6)}
        self.assertGreaterEqual(len(split_ids), 2)
        self.assertTrue(all(cluster_id >= 1000 for cluster_id in split_ids))
        self.assertTrue(all(by_source[f"case-{i}"]["parent_cluster_id"] == 7 for i in range(1, 6)))
        self.assertEqual(by_source["case-6"]["cluster_id"], 2)
        self.assertNotIn("parent_cluster_id", by_source["case-6"])

    def test_cluster_records_match_reclustered_membership_and_single_digest(self):
        records = [
            case("case-1", 7, "연장근무 신청 버튼", "권한 확인"),
            case("case-2", 7, "연장근무 신청 메뉴", "권한 추가"),
            case("case-3", 7, "출퇴근 집계 오류", "집계 재생성"),
            case("case-4", 7, "출퇴근 시간 오류", "계산 확인"),
            case("case-5", 2, "급여 조회", "메뉴 안내"),
        ]
        clusters = [
            {"cluster_id": 7, "label": "근태관리 / 안내", "case_count": 4},
            {"cluster_id": 2, "label": "급여관리 / 안내", "case_count": 1},
        ]

        result = self.recluster.recluster_top_clusters(
            records,
            clusters,
            parent_cluster_ids={7},
            target_cluster_size=2,
            min_cluster_size=1,
            new_id_start=1000,
            random_state=42,
        )

        self.assertEqual(sum(c["case_count"] for c in result.clusters), len(records))
        cluster_ids = {c["cluster_id"] for c in result.clusters}
        self.assertEqual(cluster_ids, {row["cluster_id"] for row in result.records})
        for cluster in result.clusters:
            digest_count = sum(
                1
                for row in result.records
                if row["cluster_id"] == cluster["cluster_id"] and row["is_digest"]
            )
            self.assertEqual(digest_count, 1)
            self.assertIn("digest_source_key", cluster)

    def test_spot_check_samples_are_bounded_per_parent(self):
        records = [
            case(f"case-{i}", 1000 + (i % 3), f"증상 {i}", f"조치 {i}") | {"parent_cluster_id": 7}
            for i in range(1, 12)
        ]

        samples = self.recluster.build_spot_check_samples(
            records,
            parent_cluster_ids={7},
            per_parent=5,
            random_state=42,
        )

        self.assertEqual(len(samples), 5)
        self.assertTrue(all(sample["parent_cluster_id"] == 7 for sample in samples))
        self.assertTrue(
            all({"source_key", "parent_cluster_id", "cluster_id", "symptom", "action"} <= set(sample) for sample in samples)
        )


if __name__ == "__main__":
    unittest.main()
