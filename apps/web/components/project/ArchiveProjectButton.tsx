"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function ArchiveProjectButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();

  function handleArchive() {
    const confirmed = window.confirm(
      "Archive this project? It will stay visible in history but move to archived status."
    );

    if (!confirmed) {
      return;
    }

    startTransition(async () => {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: "DELETE"
      });

      if (!response.ok) {
        return;
      }

      router.push("/projects");
      router.refresh();
    });
  }

  return (
    <Button
      variant="outline"
      className="border-rose-200 text-rose-700 hover:bg-rose-50"
      onClick={handleArchive}
      disabled={isPending}
    >
      {isPending ? "Archiving..." : "Archive Project"}
    </Button>
  );
}
