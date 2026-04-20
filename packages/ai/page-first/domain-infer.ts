/**
 * Phase-γ T8 — cheap domain inference (C 설계 Step 1).
 * Keyword hit count로 domain 추정. tie 또는 0 hit → null → 전체 catalog.
 * Identifier pattern (P_/F_/TB_/V_) → 강제 code (tie 무시).
 */
export type Domain =
  | "policies" | "procedures" | "references" | "cases"
  | "code" | "onboarding" | "guidebook" | "infra";

const KEYWORDS: Record<Domain, string[]> = {
  policies: ["휴가","빙부상","경조사","비과세","연말정산","수당","성과급","복리","퇴직연금","급여정책","연차","출장비"],
  procedures: ["신청","예약","등록","접수","재발급","오리엔테이션","입사","퇴사절차"],
  references: ["조직도","계정과목","faq","직무기술서","직급체계","연중행사","동호회"],
  cases: ["문의","장애","문제점","유사사례","사례"],
  code: ["프로시저","테이블","i/f","인터페이스","ehr4","ehr5","컬럼","함수","쿼리"],
  onboarding: ["신규입사","웰컴","멘토링","수습"],
  guidebook: ["가이드북"],
  infra: ["인프라","서버구성","회사별구성"],
};

const CODE_IDENT_RX = [/\bp_[a-z0-9_]+/i, /\bf_[a-z0-9_]+/i, /\btb_[a-z0-9_]+/i, /\bv_[a-z0-9_]+/i];

export function inferDomain(question: string): Domain | null {
  const q = question.toLowerCase();
  if (CODE_IDENT_RX.some((rx) => rx.test(q))) return "code";

  const scores: Record<string, number> = {};
  for (const [d, kws] of Object.entries(KEYWORDS)) {
    scores[d] = kws.filter((k) => q.includes(k.toLowerCase())).length;
  }
  const max = Math.max(...Object.values(scores));
  if (max === 0) return null;
  const winners = Object.entries(scores).filter(([, s]) => s === max);
  if (winners.length > 1) return null;
  return winners[0]![0] as Domain;
}
