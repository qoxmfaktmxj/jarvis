"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

export function TimeCard() {
  const t = useTranslations("Dashboard.info");
  const [text, setText] = useState("--:--:--");
  useEffect(() => {
    const update = () => {
      const fmt = new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
      });
      setText(fmt.format(new Date()));
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div
      className="flex flex-col gap-1 rounded-xl border border-surface-200 bg-card p-4"
      suppressHydrationWarning
    >
      <span className="text-xs font-medium text-surface-500">
        {t("timeLabel")}
      </span>
      <span className="text-lg font-semibold tabular-nums text-surface-900">
        {text}
      </span>
    </div>
  );
}
