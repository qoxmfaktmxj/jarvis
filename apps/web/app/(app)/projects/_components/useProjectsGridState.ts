"use client";
/**
 * apps/web/app/(app)/projects/_components/useProjectsGridState.ts
 *
 * /projects DataGrid — row state hook + blank-row factory.
 */
import { useGridState } from "@/components/grid/useGridState";
import type { ProjectListRow } from "@jarvis/shared/validation/project";

export function makeBlankProject(): ProjectListRow {
  return {
    id: crypto.randomUUID(),
    companyId: "",
    companyCode: null,
    companyName: null,
    name: "",
    status: "active",
    ownerId: null,
    ownerName: null,
    description: null,
    prodConnectType: null,
    prodDomainUrl: null,
    devConnectType: null,
    devDomainUrl: null,
  } satisfies ProjectListRow;
}

export function useProjectsGridState(initial: ProjectListRow[]) {
  return useGridState<ProjectListRow>(initial);
}
