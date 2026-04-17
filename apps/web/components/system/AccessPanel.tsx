"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type SecretField = {
  ref: string | null;
  resolved: string | null;
  canView: boolean;
};

type AccessEntry = {
  id: string;
  accessType: string;
  label: string;
  host: string | null;
  port: number | null;
  notes: string | null;
  requiredRole: string | null;
  usernameRef: SecretField;
  passwordRef: SecretField;
  connectionStringRef: SecretField;
  vpnFileRef: SecretField;
};

function renderSecretValue(field: SecretField) {
  if (!field.canView) {
    return <span className="text-surface-400">Restricted</span>;
  }

  const value = field.resolved ?? field.ref;
  if (!value) {
    return <span className="text-surface-400">Not configured</span>;
  }

  return (
    <code className="rounded bg-surface-100 px-2 py-1 text-xs text-surface-700">
      {value}
    </code>
  );
}

export function AccessPanel({
  entries,
  systemId,
  canManage
}: {
  entries: AccessEntry[];
  systemId: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  async function handleDelete(accessId: string) {
    const confirmed = window.confirm("Delete this access entry?");
    if (!confirmed) {
      return;
    }

    setDeletingId(accessId);
    try {
      const response = await fetch(
        `/api/systems/${systemId}/access?accessId=${accessId}`,
        {
          method: "DELETE"
        }
      );

      if (response.ok) {
        router.refresh();
      }
    } finally {
      setDeletingId(null);
    }
  }

  if (entries.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-surface-500">
          No access entries are registered for this system yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {entries.map((entry) => (
        <Card key={entry.id}>
          <CardHeader>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle>{entry.label}</CardTitle>
                <Badge variant="secondary">{entry.accessType}</Badge>
                {entry.requiredRole ? (
                  <Badge variant="outline">{entry.requiredRole}</Badge>
                ) : null}
              </div>
              {(entry.host || entry.port) && (
                <p className="text-sm text-surface-500">
                  {entry.host ?? "-"}
                  {entry.port ? `:${entry.port}` : ""}
                </p>
              )}
            </div>
            {canManage ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                onClick={() => handleDelete(entry.id)}
                disabled={deletingId === entry.id}
              >
                {deletingId === entry.id ? "Deleting..." : "Delete"}
              </Button>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <dl className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <dt className="font-medium text-surface-700">Username</dt>
                <dd>{renderSecretValue(entry.usernameRef)}</dd>
              </div>
              <div className="space-y-1">
                <dt className="font-medium text-surface-700">Password</dt>
                <dd>{renderSecretValue(entry.passwordRef)}</dd>
              </div>
              <div className="space-y-1">
                <dt className="font-medium text-surface-700">Connection String</dt>
                <dd>{renderSecretValue(entry.connectionStringRef)}</dd>
              </div>
              <div className="space-y-1">
                <dt className="font-medium text-surface-700">VPN File</dt>
                <dd>{renderSecretValue(entry.vpnFileRef)}</dd>
              </div>
            </dl>
            {entry.notes ? (
              <div className="rounded-lg bg-surface-50 px-3 py-2 text-surface-600">
                {entry.notes}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
