import Link from "next/link";
import { hasPermission } from "@jarvis/auth/rbac";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { SystemCard } from "@/components/system/SystemCard";
import { Input } from "@/components/ui/input";
import { listSystems } from "@/lib/queries/systems";
import { requirePageSession } from "@/lib/server/page-auth";

export const dynamic = "force-dynamic";

type SearchParams = {
  page?: string;
  category?: string;
  environment?: string;
  status?: string;
  q?: string;
};

function parsePage(value?: string) {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export default async function SystemsPage({
  searchParams
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await requirePageSession(PERMISSIONS.SYSTEM_READ, "/dashboard");
  const params = await searchParams;
  const page = parsePage(params.page);
  const result = await listSystems({
    workspaceId: session.workspaceId,
    page,
    pageSize: 24,
    category: params.category || undefined,
    environment: params.environment || undefined,
    status: params.status || undefined,
    q: params.q?.trim() || undefined
  });

  const canCreate = hasPermission(session, PERMISSIONS.SYSTEM_CREATE);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Systems</h1>
          <p className="text-sm text-gray-500">
            Maintain infrastructure records and access metadata ({result.pagination.total}{" "}
            total)
          </p>
        </div>

        {canCreate ? (
          <Link
            href="/systems/new"
            className="inline-flex h-10 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            Register System
          </Link>
        ) : null}
      </div>

      <form className="grid gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_180px_180px_auto]">
        <Input name="q" defaultValue={params.q} placeholder="Search by system name" />
        <select
          name="category"
          defaultValue={params.category ?? ""}
          className="flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
        >
          <option value="">All categories</option>
          <option value="web">web</option>
          <option value="db">db</option>
          <option value="server">server</option>
          <option value="network">network</option>
          <option value="middleware">middleware</option>
        </select>
        <select
          name="environment"
          defaultValue={params.environment ?? ""}
          className="flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
        >
          <option value="">All environments</option>
          <option value="prod">prod</option>
          <option value="staging">staging</option>
          <option value="dev">dev</option>
        </select>
        <button
          type="submit"
          className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          Apply Filters
        </button>
      </form>

      {result.data.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white py-16 text-center text-sm text-gray-500">
          No systems found.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {result.data.map((system) => (
            <SystemCard key={system.id} system={system} />
          ))}
        </div>
      )}
    </div>
  );
}
