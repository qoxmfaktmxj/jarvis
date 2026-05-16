import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { pickMascotMood } from "@/lib/mascot-mood";
import { PageHeader } from "@/components/patterns/PageHeader";

/**
 * HeroGreeting — 사용자 인사 + 오늘의 mascot + mood 한 줄.
 *
 * 시각 일관성(2026-05-16): 다른 페이지의 PageHeader(30px h1)와 동일한 타이틀
 * 크기/좌측 정렬을 사용하기 위해 PageHeader를 래핑한다. mascot 이미지와 mood
 * 텍스트는 `actions` slot으로 우측 정렬.
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
    <PageHeader
      title={t("greeting", { name })}
      actions={
        <>
          <Image
            src={`/capybara/${mood.id}.png`}
            alt=""
            width={40}
            height={40}
            priority
            unoptimized
            aria-hidden="true"
            className="shrink-0 object-contain"
          />
          <span className="text-[13px] text-(--fg-secondary)">
            {mood.message}
          </span>
        </>
      }
    />
  );
}
