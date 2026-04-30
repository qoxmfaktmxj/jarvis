import Image from "next/image";
import { pickQuoteOfTheDay } from "@/lib/quotes";

/**
 * QuoteCard — zen capybara + 오늘의 명언.
 *
 * 매일 KST 자정 기준 결정론적 회전. 한 사용자가 같은 날 페이지를 새로고침해도
 * 같은 명언을 보여줘 정보 위치가 안정됨.
 *
 * 위계:
 *  ┌────────────────────────────┐
 *  │ 오늘의 한 줄                │   ← 13px secondary
 *  │   🦫(zen, 56px)             │   ← capybara 좌측
 *  │     "단순함은 궁극의...."    │   ← 본문
 *  │     — 레오나르도 다 빈치     │   ← 출처(있을 때)
 *  └────────────────────────────┘
 */
export function QuoteCard({ now }: { now: Date }) {
  const q = pickQuoteOfTheDay(now);
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-(--border-default) bg-(--bg-surface) p-4">
      <span className="text-[13px] font-medium text-(--fg-secondary)">
        오늘의 한 줄
      </span>
      <div className="flex items-start gap-3">
        <Image
          src="/capybara/zen.png"
          alt=""
          width={56}
          height={56}
          className="shrink-0 rounded-lg"
          aria-hidden="true"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="text-[14px] font-medium leading-snug text-(--fg-primary)">
            {q.text}
          </p>
          {q.author ? (
            <p className="text-[12px] text-(--fg-muted)">— {q.author}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
