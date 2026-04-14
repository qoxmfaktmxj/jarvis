// packages/ai/router.ts
// Ask AI 6-Lane 라우터 — 질문 의도에 따라 최적 retrieval 경로를 결정한다.
//
// Lane 정의:
//   text-first      — 규정·정책·절차·FAQ (canonical wiki 우선)
//   graph-first     — 구조·연결·의존·영향도 (graph context 우선)
//   case-first      — 장애·사례·에러·"예전에" (precedent_case 우선)
//   directory-first — "어디서"·링크·URL·사이트·담당자 (directory_entry 우선)
//   action-first    — 신청·방법·경로·"어떻게 해" (directory + canonical)
//   tutor-first     — 설명·가르쳐·알려줘·뭐야 (종합 + step-by-step 응답)

export type AskLane =
  | 'text-first'
  | 'graph-first'
  | 'case-first'
  | 'directory-first'
  | 'action-first'
  | 'tutor-first';

export interface RouteResult {
  lane: AskLane;
  confidence: number;          // 0~1
  matchedPatterns: string[];   // 매칭된 규칙 패턴 (디버그용)
}

// ---------------------------------------------------------------------------
// 규칙 기반 패턴 (LLM 호출 없음 — 한국어 키워드 매칭)
// ---------------------------------------------------------------------------

// directory-first 시그널: 경로·링크·사이트·바로가기 요청
const DIRECTORY_PATTERNS = [
  /어디서/,
  /어디에서/,
  /어디 ?로/,
  /링크/,
  /url/i,
  /사이트/,
  /바로 ?가기/,
  /접속/,
  /담당자/,
  /담당 ?팀/,
  /누가 ?담당/,
  /연락처/,
  /전화번호/,
  /이메일/,
];

// action-first 시그널: 절차·신청·방법 요청
const ACTION_PATTERNS = [
  /어떻게 ?(해|하)/,
  /방법/,
  /신청/,
  /경로/,
  /순서/,
  /절차/,
  /프로세스/,
  /어떤 (단계|순서|방식)/,
  /하려면/,
  /하면 돼/,
  /하면 되나/,
];

// case-first 시그널: 사례·장애·에러 요청
const CASE_PATTERNS = [
  /장애/,
  /에러/,
  /오류/,
  /버그/,
  /사례/,
  /판례/,
  /예전에/,
  /과거에/,
  /비슷한/,
  /같은 (문제|현상|증상)/,
  /이런 (문제|현상|경우)/,
  /해결 (방법|사례)/,
  /어떻게 해결/,
  /fix/i,
  /issue/i,
];

// graph-first 시그널: 구조·연결·의존성 요청
const GRAPH_PATTERNS = [
  /구조/,
  /연결/,
  /의존/,
  /영향/,
  /관계/,
  /아키텍처/,
  /architecture/i,
  /어떤 (모듈|컴포넌트|서비스)/,
  /뭐랑 연결/,
  /어디에 영향/,
];

// tutor-first 시그널: 설명·교육·학습 요청
const TUTOR_PATTERNS = [
  /설명해/,
  /가르쳐/,
  /알려줘/,
  /이해/,
  /개념/,
  /뭔가요/,
  /뭐예요/,
  /뭐야/,
  /무엇인/,
  /처음인데/,
  /초보/,
  /기초/,
  /입문/,
];

// text-first 시그널: 규정·정책·기준 요청
const TEXT_PATTERNS = [
  /규정/,
  /정책/,
  /기준/,
  /몇 (일|시간|주|개월)/,
  /언제까지/,
  /기한/,
  /조건/,
  /자격/,
  /대상/,
  /해당 (되는|하는)/,
];

type PatternGroup = {
  lane: AskLane;
  patterns: RegExp[];
  weight: number; // 동점 해소용 우선순위 가중치
};

const PATTERN_GROUPS: PatternGroup[] = [
  { lane: 'directory-first', patterns: DIRECTORY_PATTERNS, weight: 1.2 },
  { lane: 'action-first',    patterns: ACTION_PATTERNS,    weight: 1.0 },
  { lane: 'case-first',      patterns: CASE_PATTERNS,      weight: 1.1 },
  { lane: 'graph-first',     patterns: GRAPH_PATTERNS,     weight: 1.0 },
  { lane: 'tutor-first',     patterns: TUTOR_PATTERNS,     weight: 0.9 },
  { lane: 'text-first',      patterns: TEXT_PATTERNS,      weight: 0.8 },
];

// ---------------------------------------------------------------------------
// routeQuestion — 메인 라우팅 함수
// Phase 1: 규칙 기반 (LLM 없음)
// Phase 2: 규칙 매치 없을 때 기본값 text-first 반환 (LLM 분류 추후 추가 가능)
// ---------------------------------------------------------------------------
export function routeQuestion(question: string): RouteResult {
  const q = question.toLowerCase();

  const scores: Record<AskLane, { count: number; patterns: string[] }> = {
    'text-first':      { count: 0, patterns: [] },
    'graph-first':     { count: 0, patterns: [] },
    'case-first':      { count: 0, patterns: [] },
    'directory-first': { count: 0, patterns: [] },
    'action-first':    { count: 0, patterns: [] },
    'tutor-first':     { count: 0, patterns: [] },
  };

  for (const group of PATTERN_GROUPS) {
    for (const pattern of group.patterns) {
      if (pattern.test(q)) {
        scores[group.lane].count += group.weight;
        scores[group.lane].patterns.push(pattern.source);
      }
    }
  }

  // 가장 높은 점수의 lane 선택
  let bestLane: AskLane = 'text-first';
  let bestScore = 0;

  for (const [lane, { count }] of Object.entries(scores) as [AskLane, { count: number }][]) {
    if (count > bestScore) {
      bestScore = count;
      bestLane = lane;
    }
  }

  // 점수가 0이면 기본값 text-first
  const matched = scores[bestLane].patterns;
  const confidence = bestScore > 0
    ? Math.min(0.5 + bestScore * 0.1, 0.95)
    : 0.3;

  return {
    lane: bestLane,
    confidence,
    matchedPatterns: matched,
  };
}

// ---------------------------------------------------------------------------
// Source weights per lane — used by unified retrieval in ask.ts.
// Each source is always fetched; the lane only tunes how much to trust it.
// Keys: text | case | directory | graph. Values 0..1.5.
// ---------------------------------------------------------------------------
export type SourceKind = 'text' | 'case' | 'directory' | 'graph';

export const LANE_SOURCE_WEIGHTS: Record<AskLane, Record<SourceKind, number>> = {
  'text-first':      { text: 1.0, case: 0.6, directory: 0.5, graph: 0.4 },
  'graph-first':     { text: 0.7, case: 0.5, directory: 0.4, graph: 1.2 },
  'case-first':      { text: 0.6, case: 1.2, directory: 0.5, graph: 0.3 },
  'directory-first': { text: 0.5, case: 0.4, directory: 1.3, graph: 0.2 },
  'action-first':    { text: 0.9, case: 0.8, directory: 1.1, graph: 0.3 },
  'tutor-first':     { text: 1.0, case: 0.9, directory: 0.9, graph: 0.7 },
};
