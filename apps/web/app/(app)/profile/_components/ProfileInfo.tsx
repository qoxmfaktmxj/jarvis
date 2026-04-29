"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { JarvisSession } from "@jarvis/auth/types";

export function ProfileInfo({ session }: { session: JarvisSession }) {
  const t = useTranslations("Profile.UserInfo");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-3 text-sm">
          <dt className="text-(--fg-secondary)">{t("name")}</dt>
          <dd className="font-medium text-(--fg-primary)">{session.name}</dd>

          <dt className="text-(--fg-secondary)">{t("email")}</dt>
          <dd className="text-(--fg-primary)">{session.email ?? "-"}</dd>

          <dt className="text-(--fg-secondary)">{t("employeeId")}</dt>
          <dd className="font-mono text-xs text-(--fg-secondary)">{session.employeeId}</dd>

          <dt className="text-(--fg-secondary)">{t("workspace")}</dt>
          <dd className="font-mono text-xs text-(--fg-secondary)">{session.workspaceId}</dd>

          <dt className="text-(--fg-secondary)">{t("roles")}</dt>
          <dd className="flex flex-wrap gap-2">
            {session.roles.length > 0 ? (
              session.roles.map((role) => (
                <Badge key={role} variant="secondary">
                  {role}
                </Badge>
              ))
            ) : (
              <span className="text-(--fg-secondary)">{t("noRoles")}</span>
            )}
          </dd>
        </dl>
      </CardContent>
    </Card>
  );
}
