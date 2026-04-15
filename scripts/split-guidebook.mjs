#!/usr/bin/env node
/**
 * Split docs/guidebook/isu-guidebook-full.md into docs/canonical/*.md
 * Groups related H1 sections to produce 20-40 canonical files.
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

// Group mapping: [slug, displayTitle, [...H1 headings to merge]]
const GROUPS = [
  [
    "001-hr-reform-overview",
    "2025 HR제도 개편 개요",
    ["2025년부터 변경된 다양한 HR제도"],
  ],
  ["002-isu-group-intro", "이수그룹 소개", ["이수그룹"]],
  ["003-isu-system-intro", "이수시스템 소개", ["이수시스템"]],
  ["004-org-chart", "조직도", ["조직도(2026.1.1.)"]],
  ["005-annual-events", "연중 행사", ["연중 행사"]],
  ["006-company-rules", "사규", ["사규"]],
  ["007-title-system", "직급체계", ["직급체계"]],
  ["008-salary-bonus", "급여 및 성과급", ["급여/성과급"]],
  ["009-retirement-pension", "퇴직연금", ["퇴직연금(DB/DC)"]],
  [
    "010-performance-review",
    "평가제도 및 다면진단",
    ["평가제도", "다면진단"],
  ],
  ["011-job-description", "직무기술서", ["직무기술서"]],
  [
    "012-education-system",
    "교육체계 및 교육Pool",
    ["교육체계", "교육Pool"],
  ],
  [
    "013-education-training-cert",
    "교육훈련 신청 및 자격증 취득 지원",
    ["교육훈련 신청 및 자격증 취득 지원"],
  ],
  [
    "014-award-system",
    "포상제도 및 사내강사",
    ["포상제도(근속/성과 우수자)", "사내강사 제도"],
  ],
  [
    "015-leave-vacation",
    "연차 및 특별 휴가",
    [
      "연말 공동연차",
      "성과향상프로그램(PIP)",
      "2025년도 귀속 연말정산",
      "휴가(취소) 신청서",
      "근태(취소) 신청서",
      "교육훈련(취소) 신청서",
      "휴일대체 신청 및 변경",
      "연장근무 및 야간근무",
      "연차수당 및 연차촉진",
      "연차초과사용",
    ],
  ],
  [
    "016-business-trip",
    "출장 제도",
    ["국내출장", "해외출장", "출장 유류비"],
  ],
  [
    "017-hr-admin",
    "인사행정 신청",
    [
      "건강보험 피부양자 등록",
      "일가정양립 제도",
      "입금 계좌 확인 및 변경(급여/성과급/연차수당)",
      "제증명신청",
      "개인정보변경신청",
      "휴직/복직신청",
      "퇴직신청",
      "원천징수세액조정신청",
    ],
  ],
  [
    "018-it-systems",
    "업무 IT 시스템",
    [
      "이수그룹웨어",
      "이수HR",
      "워크업(WORKUP)",
      "전자전표시스템",
      "팀즈",
      "스마트오피스",
      "이수그룹 러닝센터",
    ],
  ],
  [
    "019-attendance",
    "출퇴근 및 근태",
    [
      "출퇴근 체크 방법",
      "근태 정정 신청",
      "사이트 비콘",
      "시차출퇴근 신청",
    ],
  ],
  [
    "020-office-equipment",
    "사무 장비 및 물품",
    ["노트북지급 정책", "사원증 재발급", "명함신청", "복합기 연결"],
  ],
  [
    "021-office-facilities",
    "사무 시설 이용",
    [
      "회의실 예약",
      "퀵, 택배 이용",
      "방문자 주차등록",
      "스마트오피스(자율좌석) 이용방법",
      "개인 락커 이용방법",
      "조명/공조장치 이용방법",
      "외부 프로젝트 사무환경 지원",
      "인터넷 전화 이용방법",
      "와이파이 비밀번호",
    ],
  ],
  ["022-accounting", "회계 및 전표", ["회계 전표 계정과목"]],
  [
    "023-onboarding",
    "온보딩 및 수습 제도",
    [
      "웰컴 키트",
      "수습 기간",
      "오리엔테이션",
      "멘토링 제도",
      "수습 PT",
      "Job Simulation",
      "수습평가",
    ],
  ],
  [
    "024-welfare-benefits",
    "복지 및 혜택",
    [
      "복지카드",
      "법인카드",
      "수능자녀응원",
      "주택자금 대출",
      "경조사",
      "구내식당&매점",
      "자녀 학자금",
      "건강검진 지원",
      "독감 예방접종 지원",
      "단체상해보험",
      "법인콘도예약",
      "회사 유니폼",
      "스낵바",
      "사내 샤워실",
    ],
  ],
  [
    "025-clubs-activities",
    "사내 동호회 및 스터디",
    [
      "사내 동호회",
      "야구동호회",
      "축구동호회",
      "골프동호회",
      "(스터디) 슬기로운 자기개발",
      "(스터디) 개발의 민족",
    ],
  ],
  [
    "026-labor-council",
    "업무 담당자 및 노사협의회",
    ["업무 담당자", "노사협의회"],
  ],
  ["027-faq", "자주하는 질문", ["자주하는 질문"]],
  ["028-project-operations", "프로젝트 수행", ["프로젝트 수행"]],
];

function normalizeHeading(line) {
  return line.replace(/^#+\s*/, "").trim();
}

function parseSections(filepath) {
  const text = readFileSync(filepath, "utf-8");
  const lines = text.split("\n");
  const sections = new Map();
  let currentHeading = null;
  let buffer = [];

  for (const line of lines) {
    // H1 only: starts with exactly one #
    if (/^# /.test(line) && !/^## /.test(line)) {
      if (currentHeading !== null) {
        sections.set(currentHeading, buffer.join("\n"));
      }
      currentHeading = normalizeHeading(line);
      buffer = [line];
    } else {
      buffer.push(line);
    }
  }

  // Save last section
  if (currentHeading !== null) {
    sections.set(currentHeading, buffer.join("\n"));
  }

  return sections;
}

function makeFrontmatter(slug, displayTitle, includedHeadings) {
  const sectionsYaml = includedHeadings
    .map((h) => `  - "${h}"`)
    .join("\n");
  return `---
source: docs/guidebook/isu-guidebook-full.md
section: "${displayTitle}"
canonical: true
included_sections:
${sectionsYaml}
---

`;
}

function main() {
  const guidebookPath = join(
    repoRoot,
    "docs",
    "guidebook",
    "isu-guidebook-full.md"
  );
  const canonicalDir = join(repoRoot, "docs", "canonical");
  mkdirSync(canonicalDir, { recursive: true });

  console.log(`Parsing: ${guidebookPath}`);
  const sections = parseSections(guidebookPath);
  console.log(`Found ${sections.size} H1 sections`);

  const covered = new Set();
  const createdFiles = [];

  for (const [slug, displayTitle, groupHeadings] of GROUPS) {
    const contentParts = [];
    const matched = [];

    for (const h of groupHeadings) {
      if (sections.has(h)) {
        contentParts.push(sections.get(h));
        covered.add(h);
        matched.push(h);
      } else {
        console.warn(`  WARNING: heading not found: '${h}'`);
      }
    }

    if (contentParts.length === 0) {
      console.log(`  SKIP (no content): ${slug}`);
      continue;
    }

    const frontmatter = makeFrontmatter(slug, displayTitle, matched);
    const body = contentParts
      .map((p) => p.trim())
      .join("\n\n---\n\n");
    const fullContent = frontmatter + body + "\n";

    const outPath = join(canonicalDir, `${slug}.md`);
    writeFileSync(outPath, fullContent, "utf-8");
    createdFiles.push(`${slug}.md`);
    console.log(`  Created: ${slug}.md (${matched.length} sections merged)`);
  }

  // Report uncovered
  const uncovered = [...sections.keys()].filter((h) => !covered.has(h));
  if (uncovered.length > 0) {
    console.log(`\nUncovered headings (${uncovered.length}):`);
    for (const h of uncovered) console.log(`  - ${h}`);
  } else {
    console.log("\nAll headings covered.");
  }

  console.log(`\nTotal canonical files created: ${createdFiles.length}`);
  for (const f of createdFiles) {
    console.log(`  docs/canonical/${f}`);
  }
}

main();
