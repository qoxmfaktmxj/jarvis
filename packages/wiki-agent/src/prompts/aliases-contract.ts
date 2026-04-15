import { MIN_ALIASES } from "../constants.js";

/**
 * Aliases requirement block for the Generation prompt.
 *
 * This is the **hard contract** that prevents the MindVault
 * regression where "마인드볼트" and "MindVault" were treated
 * as different concepts because no alias layer existed.
 *
 * Must be literally present in the Generation system prompt;
 * a regression test asserts the exact string "ALIASES REQUIREMENT".
 *
 * Keep bilingual (Korean directive + English example) — the
 * wiki is Korean-English mixed and both forms are needed in
 * real frontmatter.
 */
export const ALIASES_CONTRACT = [
  "## ALIASES REQUIREMENT (반드시 준수)",
  "",
  `각 페이지 frontmatter의 \`aliases\` 배열에 한국어·영문·축약어 동의어를 **최소 ${MIN_ALIASES}개** 자동 생성하라.`,
  "",
  '예: title="MindVault" → aliases=["마인드볼트", "mind vault", "MV"]',
  "",
  `${MIN_ALIASES}개 미만이면 pipeline이 실패한다 (MindVault 실패 조건 #3 재발 방지).`,
  "",
  "Alias 생성 규칙:",
  "- 한국어 발음 표기 1개 이상 (예: \"마인드볼트\")",
  "- 영문 원어·공백 변형 1개 이상 (예: \"mind vault\", \"MindVault\")",
  "- 축약어·이니셜 가능 시 1개 (예: \"MV\")",
  "- 단, 페이지 주제가 순한국어(예: \"인사 규정\")이면 영문 번역·로마자 표기·공식 약어로 대체",
  "- aliases 값은 검색용이므로 특수기호·따옴표 금지, 2~30자",
].join("\n");
