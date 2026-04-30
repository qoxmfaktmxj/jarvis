import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { pickMascotMood } from "@/lib/mascot-mood";

/**
 * HeroGreeting — 사용자 인사 + 오늘의 mascot + mood 한 줄.
 *
 * 16종 capybara mascot 중 1개를 매일 KST 결정론적 rotate. 시간대/요일에 따른
 * 컨텍스트 매칭(점심: cabbage, 야근: reading 등)이 있어 단순 rotate보다 살아있음.
 *
 * mascot 옆 mood 한 줄은 mascot별 풀에서 같은 seed로 선택 → 같은 날 동일 표시.
 */
export async function HeroGreeting({
  name,
  now
}: {
  name: string;
  now: Date;
}) {
  const t = await getTranslations("Dashboard");
  const mood = pickMascotMood(now);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <h1 className="text-2xl font-bold tracking-tight text-(--fg-primary)">
        {t("greeting", { name })}
      </h1>
      <Image
        src={`/capybara/${mood.id}.png`}
        alt=""
        width={40}
        height={40}
        priority
        aria-hidden="true"
        className="shrink-0"
      />
      <span className="text-[13px] text-(--fg-secondary)">
        {mood.message}
      </span>
    </div>
  );
}
