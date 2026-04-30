/**
 * mascot-mood.ts — 헤더 capybara mascot rotate + mood 한 줄.
 *
 * 16종 capybara(public/capybara/*.png)와 대응 mood 메시지를 매핑.
 * 매일 KST 기준 결정론적 회전. 사용자가 같은 날 새로고침해도 동일 mascot 표시.
 *
 * 시간대/요일 같은 보너스 트리거(점심 시간엔 watermelon, 야근엔 reading)를 줘서
 * 단순 daily rotate보다 "맥락에 맞는 변화"를 만든다.
 */

export type MascotId =
  | "basic"
  | "reading"
  | "zen"
  | "armchair"
  | "astronaut"
  | "bird"
  | "cabbage"
  | "chef"
  | "diver"
  | "garden"
  | "music"
  | "onsen"
  | "painter"
  | "snorkel"
  | "surprise"
  | "watermelon";

export interface MascotMood {
  id: MascotId;
  message: string;
}

const MASCOT_LIBRARY: Record<MascotId, string[]> = {
  basic: [
    "오늘도 잘 부탁드립니다.",
    "차분하게 시작해볼까요.",
    "한 호흡 고르고 출발."
  ],
  reading: [
    "위키 한 페이지 더 읽어볼까요?",
    "오늘 알게 된 것 하나, 메모해두기.",
    "긴 글은 천천히, 짧은 결정은 빠르게."
  ],
  zen: [
    "급할수록 돌아가요.",
    "마음을 내려놓고, 한 가지부터.",
    "오늘은 고요하게."
  ],
  armchair: [
    "잠깐 앉아서 한 모금.",
    "쉬는 것도 일의 일부예요.",
    "5분만 의자 깊이 앉아볼까요."
  ],
  astronaut: [
    "오늘은 멀리 보고 가봐요.",
    "큰 그림 한 번 점검할 시간.",
    "분기 목표 다시 한 번."
  ],
  bird: [
    "기분 좋은 메시지 한 마디.",
    "동료에게 인사부터.",
    "가벼운 한 마디로 분위기 따뜻하게."
  ],
  cabbage: [
    "점심 메뉴, 오늘은 뭐로?",
    "야채 한 끼, 가볍게.",
    "구내식당 가보실래요?"
  ],
  chef: [
    "오늘은 잘 챙겨 드세요.",
    "에너지 있는 점심 한 끼.",
    "맛있게 먹는 것도 컨디션 관리."
  ],
  diver: [
    "한 작업에 푹 들어가 봐요.",
    "표면을 떠나, 깊이로.",
    "방해 끄고 25분만 집중."
  ],
  garden: [
    "작은 일에 정성을.",
    "오래 가꾸면 어김없이 자라요.",
    "꾸준함이 이깁니다."
  ],
  music: [
    "오늘의 BGM, 무엇으로?",
    "리듬에 맞춰 한 박자.",
    "잠깐 음악과 함께 환기."
  ],
  onsen: [
    "퇴근 후 따뜻한 물에 푹.",
    "긴장을 풀 시간.",
    "어깨 근육부터 천천히."
  ],
  painter: [
    "오늘은 한 줄 더 다듬어볼까요.",
    "디테일이 작품을 만든다.",
    "마지막 한 획에 진심."
  ],
  snorkel: [
    "수면 위 살짝, 호기심으로.",
    "다른 팀 사정도 한번 들여다보기.",
    "시야를 조금만 넓혀봐요."
  ],
  surprise: [
    "오늘은 무슨 일이 기다리고 있을까요!",
    "기대하지 않은 좋은 소식 한 통 오기를.",
    "예상 밖의 한 걸음."
  ],
  watermelon: [
    "수분 보충은 잘 하고 계신가요?",
    "달달한 한 입의 여유.",
    "여름엔 시원하게."
  ]
};

/** KST 기준 YYYY-MM-DD. */
function kstDateString(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
}

/** KST 시(0-23). */
function kstHour(now: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Seoul",
      hour: "2-digit",
      hour12: false
    }).format(now)
  );
}

/** KST 요일(0=Sun, 6=Sat). */
function kstWeekday(now: Date): number {
  const wd = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    weekday: "short"
  }).format(now);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd);
}

function dayHash(dateStr: string): number {
  let h = 0;
  for (let i = 0; i < dateStr.length; i++) {
    h = (h * 31 + dateStr.charCodeAt(i)) >>> 0;
  }
  return h;
}

const ALL_IDS = Object.keys(MASCOT_LIBRARY) as MascotId[];

/**
 * 오늘의 mascot 선정. 시간대/요일별 우선순위 trigger를 먼저 검사하고,
 * 매칭이 없으면 일별 결정론적 rotate.
 */
export function pickMascotMood(
  now: Date,
  allowed: ReadonlySet<MascotId> = new Set(ALL_IDS)
): MascotMood {
  const hour = kstHour(now);
  const weekday = kstWeekday(now);
  const seed = dayHash(kstDateString(now));

  // 컨텍스트 기반 우선 매칭. allowed에 들어 있을 때만 사용.
  const ctxId: MascotId | null =
    hour === 12 || hour === 13
      ? "cabbage"
      : hour >= 20
        ? "reading"
        : weekday === 5 && hour >= 14
          ? "surprise" // 금요일 오후
          : weekday === 1 && hour < 11
            ? "chef" // 월요일 아침
            : null;

  if (ctxId && allowed.has(ctxId)) {
    return pickFromPool(ctxId, seed);
  }

  // 일별 rotate — allowed 풀 안에서 결정론적 선택.
  const pool = ALL_IDS.filter((id) => allowed.has(id));
  if (pool.length === 0) return pickFromPool("basic", seed);
  const id = pool[seed % pool.length] ?? "basic";
  return pickFromPool(id, seed);
}

function pickFromPool(id: MascotId, seed: number): MascotMood {
  const messages = MASCOT_LIBRARY[id] ?? ["오늘도 잘 부탁드립니다."];
  const message = messages[seed % messages.length] ?? messages[0]!;
  return { id, message };
}

export const MASCOT_LIBRARY_FOR_TEST = MASCOT_LIBRARY;
