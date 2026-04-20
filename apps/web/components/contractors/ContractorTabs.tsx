"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

export function ContractorTabs() {
  const t = useTranslations("Contractors");
  const pathname = usePathname();
  const tabs = [
    { href: "/contractors", label: t("tabs.roster") },
    { href: "/contractors/schedule", label: t("tabs.schedule") }
  ];
  return (
    <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--line)", marginBottom: 16 }}>
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            style={{
              padding: "8px 16px",
              borderBottom: active ? "2px solid var(--ink)" : "2px solid transparent",
              color: active ? "var(--ink)" : "var(--muted)",
              fontWeight: active ? 600 : 400,
              textDecoration: "none"
            }}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
