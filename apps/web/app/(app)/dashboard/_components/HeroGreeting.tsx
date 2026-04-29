import Image from "next/image";
import { getTranslations } from "next-intl/server";

export async function HeroGreeting({ name }: { name: string }) {
  const t = await getTranslations("Dashboard");
  return (
    <div className="flex items-center gap-3">
      <h1 className="text-2xl font-bold tracking-tight text-(--fg-primary)">
        {t("greeting", { name })}
      </h1>
      <Image
        src="/capybara/basic.png"
        alt=""
        width={40}
        height={40}
        priority
      />
    </div>
  );
}
