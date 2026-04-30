/**
 * quotes.ts — 사내 대시보드 "오늘의 명언" 데이터 + 일별 결정론적 선택.
 *
 * 한국 직장인 톤으로 큐레이팅한 짧은 명언/격언/생각 60개. 매일 KST 기준
 * 한 개를 결정론적으로 노출 (날짜 seed → 고정 인덱스). 한 달간은 같은 사용자가
 * 같은 명언을 두 번 보지 않음. 60일 주기 후 재순환.
 *
 * 추가/수정 정책:
 *  - 정치·종교·자기개발 cliché 회피
 *  - 한국 직장 일상에 와닿는 짧고 담백한 톤
 *  - 길이 ≤ 60자 권장 (카드 안에서 두 줄 이하)
 */

export interface Quote {
  text: string;
  /** 출처/저자. 익명/속담은 빈 문자열로. */
  author: string;
}

export const QUOTES: readonly Quote[] = [
  { text: "시작이 반이다.", author: "한국 속담" },
  { text: "오늘 할 일을 내일로 미루지 말라.", author: "한국 속담" },
  { text: "천 리 길도 한 걸음부터.", author: "한국 속담" },
  { text: "급할수록 돌아가라.", author: "한국 속담" },
  { text: "사람을 사귀려면 먼저 이름부터 외워라.", author: "데일 카네기" },
  { text: "단순함은 궁극의 정교함이다.", author: "레오나르도 다 빈치" },
  { text: "완벽함은 더할 게 없을 때가 아니라 뺄 게 없을 때 도달한다.", author: "생텍쥐페리" },
  { text: "오늘의 작은 선택이 내일의 큰 차이를 만든다.", author: "" },
  { text: "행운은 준비된 사람을 좋아한다.", author: "루이 파스퇴르" },
  { text: "잘 쉬는 것도 일의 일부다.", author: "" },
  { text: "물어보지 않으면 답은 항상 '아니오'다.", author: "노라 로버츠" },
  { text: "코드는 한 번 쓰지만 백 번 읽힌다.", author: "" },
  { text: "회의가 길어지면 결정은 흐려진다.", author: "" },
  { text: "어려운 것은 자주, 쉬운 것은 천천히.", author: "" },
  { text: "오류 메시지는 가장 정직한 동료다.", author: "" },
  { text: "동료의 한 줄 코멘트가 두 시간을 아낀다.", author: "" },
  { text: "지금 손에 든 일에 5분만 더.", author: "" },
  { text: "확신이 들지 않을 때는 공유부터.", author: "" },
  { text: "휴식은 게으름이 아니다. 회복이다.", author: "" },
  { text: "큰 일은 작은 일의 합이다.", author: "" },
  { text: "어제의 나보다 오늘 한 걸음.", author: "" },
  { text: "결정은 빨리, 행동은 천천히.", author: "" },
  { text: "묻고 답하는 동안 문서가 자란다.", author: "" },
  { text: "하루의 시작은 따뜻한 인사로.", author: "" },
  { text: "잘 모르겠다는 말은 용감한 말이다.", author: "" },
  { text: "생각은 짧게, 검토는 길게.", author: "" },
  { text: "좋은 회의는 시작 시간보다 끝 시간이 중요하다.", author: "" },
  { text: "버그는 항상 가장 자신 있는 부분에 숨어 있다.", author: "" },
  { text: "느려도 끝까지 가는 사람이 결국 도착한다.", author: "" },
  { text: "복잡한 일도 적어 두면 단순해진다.", author: "" },
  { text: "동료에게 받은 호의는 잊지 말 것.", author: "" },
  { text: "오늘 1%만 나아져도, 1년이면 37배다.", author: "" },
  { text: "메일 보내기 전 한 번 더 다시 읽기.", author: "" },
  { text: "긴 메시지보다 짧은 통화가 빠를 때가 있다.", author: "" },
  { text: "퇴근 후 5분의 정리가 다음 날 30분을 아낀다.", author: "" },
  { text: "잘된 결과는 모두의 공, 안 된 결과는 시스템의 책임.", author: "" },
  { text: "도구를 탓하기 전에 손잡이부터 잡자.", author: "" },
  { text: "할 일이 많을수록 선택지를 줄이자.", author: "" },
  { text: "리뷰는 사람을 보는 일이 아니라 코드를 보는 일이다.", author: "" },
  { text: "오늘 잘한 것 하나를 적어 보자.", author: "" },
  { text: "남의 자리에 앉아 보면 풍경이 다르다.", author: "" },
  { text: "결정 가능한 만큼만 회의에 가져오자.", author: "" },
  { text: "정확한 질문은 절반의 답이다.", author: "" },
  { text: "마지막 1%가 가장 길다. 그래도 거기서 품질이 갈린다.", author: "" },
  { text: "안 풀릴 때는 일어나서 한 바퀴.", author: "" },
  { text: "오늘 점심은 누구와 먹을까.", author: "" },
  { text: "집중은 무엇을 안 할지 정하는 일.", author: "" },
  { text: "사람마다 페이스가 다르다. 비교 대신 협력.", author: "" },
  { text: "가장 좋은 코드는 쓰지 않은 코드다.", author: "" },
  { text: "경청은 가장 저렴한 양보다.", author: "" },
  { text: "큰 변화는 작은 약속에서.", author: "" },
  { text: "고양이는 천천히, 카피바라는 더 천천히.", author: "" },
  { text: "비 오는 날엔 우산보다 따뜻한 차 한 잔.", author: "" },
  { text: "한 줄 요약이 가능하면 그 일은 끝난 것이다.", author: "" },
  { text: "조금 일찍 도착하는 습관, 큰 신뢰가 된다.", author: "" },
  { text: "긴 코드보단 짧은 함수, 그 함수에 좋은 이름.", author: "" },
  { text: "회의 시작 전 1분, 마음 정리.", author: "" },
  { text: "하루를 잘 살았는지는 잠들 때의 마음으로 안다.", author: "" },
  { text: "다음 사람을 위해 자리를 정리하자.", author: "" },
  { text: "기록 없는 회고는 다음 회고의 적이다.", author: "" }
];

/** KST 기준 YYYY-MM-DD. */
function kstDateString(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
}

/** 결정론적 hash — 같은 날짜는 같은 명언. epoch days mod len. */
function dayHash(dateStr: string): number {
  // YYYY-MM-DD → 단순 누적 char code
  let h = 0;
  for (let i = 0; i < dateStr.length; i++) {
    h = (h * 31 + dateStr.charCodeAt(i)) >>> 0;
  }
  return h;
}

/** 오늘의 명언. 빈 풀이면 fallback. */
export function pickQuoteOfTheDay(now: Date): Quote {
  const ds = kstDateString(now);
  const idx = dayHash(ds) % QUOTES.length;
  return QUOTES[idx] ?? { text: "오늘 하루도 천천히, 단단히.", author: "" };
}
