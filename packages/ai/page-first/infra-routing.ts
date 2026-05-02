/**
 * packages/ai/page-first/infra-routing.ts
 *
 * Intent classifier: decides whether a user question is asking about infra
 * (server access, DB connection, VPN, deployment path, credential, incident
 * history) and therefore should prefer `domain=infra` pages in the shortlist.
 *
 * Deliberately heuristic, not LLM-based:
 *   - Zero extra latency on the hot query path
 *   - Tokens are cheap to match — the page-first recall already does ILIKE
 *     on title/path/tags, so boosting recall via a domain filter is nearly
 *     free when the keyword set is tight
 *   - False negatives fall back to generic recall, which is fine (we just
 *     miss the boost; correctness preserved)
 *
 * Re-trained by: editing INFRA_KEYWORDS. Add a company code here and any
 * question mentioning it routes to infra.
 */

/**
 * Keywords that survive substring matching safely: long / unambiguous / Korean
 * phrases that virtually never appear inside unrelated words.
 */
const INFRA_KEYWORDS_SUBSTRING: readonly string[] = [
  // 운영 동사·명사 (operation verbs/nouns)
  "접속",
  "로그인",
  "배포",
  "재기동",
  "재시작",
  "패치",
  "장애",
  "복구",
  "원격접속",
  // 네트워크·서버 (network/server — long enough to avoid collisions)
  "vpn",
  "vdi",
  "rdp",
  "tomcat",
  "웹스피어",
  "websphere",
  "resin",
  "sftp",
  // DB
  "데이터베이스",
  "oracle",
  "cryptit",
  // 경로·시스템 파일
  "배포경로",
  "소스경로",
  "main.jsp",
  // 자격증명 맥락
  "계정",
  "비밀번호",
  "패스워드",
  "아이디",
  // 운영 도구
  "weguardia",
  "알ftp",
  // 일반 HR 시스템 약어
  "ehr",
  "hris",
  "e-hr",
];

/**
 * Keywords that REQUIRE a word boundary (start/end of string, whitespace, or
 * ASCII punctuation) on both sides. These are short/ambiguous tokens that
 * would otherwise false-positive on common words (`handbook` → "db",
 * `standard` → "rd", `classification` → "class", `warning` → "war").
 */
const INFRA_KEYWORDS_BOUNDARY: readonly string[] = [
  "db",
  "rd",
  "was",
  "war",
  "ftp",
  "tns",
  "dsn",
  "dba",
  "sid",
  "class",
  "jsp",
  "ssh",
  "putty",
  "whe",
  "hmm",
  "stlc",
  "jaseng",
  // 한글 단독 토큰
  "원격",
];

/** Characters that count as word boundaries before/after a short keyword. */
const BOUNDARY_CLASS = "[\\s.,;:!?()\\[\\]{}<>/'\"`-]";

function boundaryRegex(keyword: string): RegExp {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `(^|${BOUNDARY_CLASS})${escaped}($|${BOUNDARY_CLASS})`,
    "i",
  );
}

const BOUNDARY_REGEXES: ReadonlyArray<RegExp> =
  INFRA_KEYWORDS_BOUNDARY.map(boundaryRegex);

/** ASCII-lowercase + trim; Korean not normalized (already Unicode). */
function normalize(question: string): string {
  return question.toLowerCase();
}

/**
 * Returns `true` when the question mentions at least one infra keyword.
 * Caller forwards this as `domain: "infra"` to `lexicalShortlist`.
 *
 * Two-pass matching keeps false positives out:
 *   1. Unambiguous keywords (≥ 4 chars, Korean phrases, compound words):
 *      simple substring check, cheapest path.
 *   2. Ambiguous short keywords (`db`, `rd`, `war`, `class`, company codes):
 *      require word boundaries so `handbook` / `standard` / `classification`
 *      / `warning` do NOT match.
 *
 * Invariant: false positives on this classifier silently restrict the
 * shortlist to `domain=infra` pages, hiding correct non-infra matches. The
 * cost of a false positive is ZERO relevant results for a user, so precision
 * matters more than recall here.
 */
export function detectInfraIntent(question: string): boolean {
  if (!question) return false;
  const lower = normalize(question);
  if (INFRA_KEYWORDS_SUBSTRING.some((kw) => lower.includes(kw))) {
    return true;
  }
  return BOUNDARY_REGEXES.some((re) => re.test(lower));
}
