"use client";

import { useEffect, useState } from "react";

/**
 * TodayClock — 라이브 시계.
 *
 * 1초 tick. 모노스페이스(--font-mono = JetBrains Mono) + tabular-nums로
 * 숫자 너비 변동에도 카드 폭이 흔들리지 않도록.
 * SSR 시점에는 빈 문자열을 그렸다가 hydration 직후 첫 tick에 채움 (FOUC 방지보단
 * 시각이 1초 어긋나는 hydration mismatch 방지가 더 중요).
 */
export function TodayClock() {
  const [text, setText] = useState("");

  useEffect(() => {
    const fmt = new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    });
    const update = () => setText(fmt.format(new Date()));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <span
      className="font-mono text-[36px] font-bold leading-none tracking-tight tabular-nums text-(--fg-primary)"
      style={{ fontFamily: "var(--font-mono), ui-monospace, SFMono-Regular, monospace" }}
      suppressHydrationWarning
    >
      {text || " "}
    </span>
  );
}
