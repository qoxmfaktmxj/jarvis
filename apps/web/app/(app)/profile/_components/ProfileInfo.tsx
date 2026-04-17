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
          <dt className="text-muted-foreground">{t("name")}</dt>
          <dd className="font-medium text-foreground">{session.name}</dd>

          <dt className="text-muted-foreground">{t("email")}</dt>
          <dd className="text-foreground">{session.email ?? "-"}</dd>

          <dt className="text-muted-foreground">{t("employeeId")}</dt>
          <dd className="font-mono text-xs text-surface-600">{session.employeeId}</dd>

          <dt className="text-muted-foreground">{t("workspace")}</dt>
          <dd className="font-mono text-xs text-surface-600">{session.workspaceId}</dd>

          <dt className="text-muted-foreground">{t("roles")}</dt>
          <dd className="flex flex-wrap gap-2">
            {session.roles.length > 0 ? (
              session.roles.map((role) => (
                <Badge key={role} variant="secondary">
                  {role}
                </Badge>
              ))
            ) : (
              <span className="text-muted-foreground">{t("noRoles")}</span>
            )}
          </dd>
        </dl>
      </CardContent>
    </Card>
  );
}
