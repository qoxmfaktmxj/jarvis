import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { verifyApprovedRoutesAgainstSharedConstants, verifyRoutes } from "./verify-routes.js";

describe("verifyRoutes", () => {
  it("keeps seeded menus aligned with the shared public route contract", () => {
    expect(verifyApprovedRoutesAgainstSharedConstants()).toEqual({ violations: [] });
  });

  it("passes when no route tree has been created", async () => {
    const root = await mkdtemp(join(tmpdir(), "jarvis-routes-empty-"));

    await expect(verifyRoutes(root, true)).resolves.toEqual({ violations: [] });
  });

  it("passes on exact allowlisted routes and flags admin or api prefixes that are not exact matches", async () => {
    const root = await mkdtemp(join(tmpdir(), "jarvis-routes-"));
    await mkdir(join(root, "apps/web/app"), { recursive: true });
    await writeFile(join(root, "apps/web/app/page.tsx"), "export default function Page() {}\n");
    await mkdir(join(root, "apps/web/app/forbidden"), { recursive: true });
    await writeFile(join(root, "apps/web/app/forbidden/page.tsx"), "export default function Page() {}\n");
    await mkdir(join(root, "apps/web/app/(auth)/login"), { recursive: true });
    await writeFile(join(root, "apps/web/app/(auth)/login/page.tsx"), "export default function Page() {}\n");
    await mkdir(join(root, "apps/web/app/(app)/ask/[conversationId]"), { recursive: true });
    await writeFile(join(root, "apps/web/app/(app)/ask/[conversationId]/page.tsx"), "export default function Page() {}\n");
    await mkdir(join(root, "apps/web/app/(app)/wiki/manual/edit/[...path]"), { recursive: true });
    await writeFile(join(root, "apps/web/app/(app)/wiki/manual/edit/[...path]/page.tsx"), "export default function Page() {}\n");
    await mkdir(join(root, "apps/web/app/(app)/admin/users"), { recursive: true });
    await writeFile(join(root, "apps/web/app/(app)/admin/users/page.tsx"), "export default function Page() {}\n");
    await mkdir(join(root, "apps/web/app/api/auth/login"), { recursive: true });
    await writeFile(join(root, "apps/web/app/api/auth/login/route.ts"), "export async function GET() {}\n");
    await mkdir(join(root, "apps/web/app/api/wiki/page"), { recursive: true });
    await writeFile(join(root, "apps/web/app/api/wiki/page/route.ts"), "export async function GET() {}\n");
    await mkdir(join(root, "apps/web/app/api/search"), { recursive: true });
    await writeFile(join(root, "apps/web/app/api/search/route.ts"), "export async function GET() {}\n");
    await mkdir(join(root, "apps/web/app/(app)/admin/anything"), { recursive: true });
    await writeFile(join(root, "apps/web/app/(app)/admin/anything/page.tsx"), "export default function Page() {}\n");
    await mkdir(join(root, "apps/web/app/api/admin/anything"), { recursive: true });
    await writeFile(join(root, "apps/web/app/api/admin/anything/route.ts"), "export async function GET() {}\n");

    const report = await verifyRoutes(root, true);
    expect(report.violations).toEqual([
      "Unapproved route: /admin/anything",
      "Unapproved route: /api/admin/anything",
    ]);
  });
});
