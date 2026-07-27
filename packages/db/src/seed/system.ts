import type { Pool, PoolClient } from "pg";
import { SYSTEM_MENUS } from "@jarvis/shared/constants/routes";

export const PUBLIC_WORKSPACE_CODE = "public-demo";

const PERMISSIONS = [
  ["wiki:read", "Read Wiki"],
  ["wiki:edit", "Edit manual Wiki"],
  ["ask:use", "Use Ask AI"],
  ["source:read", "Read evidence sources"],
  ["source:ingest", "Ingest evidence sources"],
  ["review:manage", "Manage Wiki reviews"],
  ["user:admin", "Administer users"],
  ["menu:admin", "Administer menus"],
  ["code:admin", "Administer codes"],
  ["llm-usage:read", "Read LLM usage"],
  ["audit:read", "Read audit log"],
] as const;

const ROLE_PERMISSIONS = {
  READER: ["wiki:read", "ask:use", "source:read"],
  EDITOR: ["wiki:read", "wiki:edit", "ask:use", "source:read", "source:ingest", "review:manage"],
  ADMIN: PERMISSIONS.map(([code]) => code),
} as const;

const CODE_GROUPS = [
  ["SOURCE_TYPE", "자료 유형", [["LAW", "법령"], ["CASE", "판례·판정"], ["INTERPRETATION", "행정해석"], ["GUIDE", "공식 가이드"]]],
  ["WIKI_STATUS", "Wiki 상태", [["DRAFT", "초안"], ["PUBLISHED", "게시"], ["ARCHIVED", "보관"]]],
  ["REVIEW_STATUS", "검토 상태", [["PENDING", "대기"], ["IN_REVIEW", "검토 중"], ["RESOLVED", "해결"], ["DISMISSED", "기각"]]],
] as const;

async function transaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function seedSystem(pool: Pool): Promise<{ workspaceId: string }> {
  return transaction(pool, async (client) => {
    const workspaceResult = await client.query<{ id: string }>(
      `
        INSERT INTO workspace(code, name, settings)
        VALUES ($1, $2, $3::jsonb)
        ON CONFLICT (code) DO UPDATE
        SET name = EXCLUDED.name,
            settings = EXCLUDED.settings,
            updated_at = now()
        RETURNING id
      `,
      [PUBLIC_WORKSPACE_CODE, "Jarvis Public Demo", JSON.stringify({ locale: "ko", synthetic: true })],
    );
    const workspaceId = workspaceResult.rows[0]?.id;
    if (!workspaceId) {
      throw new Error("system seed could not resolve public workspace");
    }

    for (const [code, description] of PERMISSIONS) {
      await client.query(
        `
          INSERT INTO permission(code, description)
          VALUES ($1, $2)
          ON CONFLICT (code) DO UPDATE
          SET description = EXCLUDED.description
        `,
        [code, description],
      );
    }

    for (const [code, name] of [["ADMIN", "관리자"], ["EDITOR", "편집자"], ["READER", "열람자"]] as const) {
      await client.query(
        `
          INSERT INTO role(workspace_id, code, name, is_system)
          VALUES ($1, $2::role_code, $3, true)
          ON CONFLICT (workspace_id, code) DO UPDATE
          SET name = EXCLUDED.name,
              is_system = true
        `,
        [workspaceId, code, name],
      );
    }

    await client.query("DELETE FROM role_permission WHERE workspace_id = $1", [workspaceId]);
    for (const [roleCode, permissionCodes] of Object.entries(ROLE_PERMISSIONS)) {
      await client.query(
        `
          INSERT INTO role_permission(workspace_id, role_id, permission_id)
          SELECT $1, r.id, p.id
          FROM role r
          CROSS JOIN permission p
          WHERE r.workspace_id = $1
            AND r.code = $2::role_code
            AND p.code = ANY($3::text[])
        `,
        [workspaceId, roleCode, permissionCodes],
      );
    }

    for (const menuDefinition of SYSTEM_MENUS) {
      const { code, label, description, routePath, icon, sortOrder, isVisible } = menuDefinition;
      const permissionCode = menuDefinition.permissionCodes[0];
      const menu = await client.query<{ id: string }>(
        `
          INSERT INTO menu_item(
            workspace_id, code, label, description, kind, icon, route_path, sort_order, is_visible
          ) VALUES ($1, $2, $3, $4, 'page', $5, $6, $7, $8)
          ON CONFLICT (workspace_id, code) DO UPDATE
          SET label = EXCLUDED.label,
              description = EXCLUDED.description,
              kind = 'page',
              icon = EXCLUDED.icon,
              route_path = EXCLUDED.route_path,
              sort_order = EXCLUDED.sort_order,
              updated_at = now()
          RETURNING id
        `,
        [workspaceId, code, label, description, icon, routePath, sortOrder, isVisible],
      );
      const menuId = menu.rows[0]?.id;
      if (!menuId) {
        throw new Error(`menu seed failed: ${code}`);
      }

      await client.query("DELETE FROM menu_permission WHERE workspace_id = $1 AND menu_item_id = $2", [workspaceId, menuId]);
      await client.query(
        `
          INSERT INTO menu_permission(workspace_id, menu_item_id, permission_id)
          SELECT $1, $2, id
          FROM permission
          WHERE code = $3
        `,
        [workspaceId, menuId, permissionCode],
      );
    }

    for (const [groupCode, groupName, items] of CODE_GROUPS) {
      const group = await client.query<{ id: string }>(
        `
          INSERT INTO code_group(workspace_id, code, name, is_active)
          VALUES ($1, $2, $3, true)
          ON CONFLICT (workspace_id, code) DO UPDATE
          SET name = EXCLUDED.name,
              is_active = true,
              updated_at = now()
          RETURNING id
        `,
        [workspaceId, groupCode, groupName],
      );
      const groupId = group.rows[0]?.id;
      if (!groupId) {
        throw new Error(`code-group seed failed: ${groupCode}`);
      }

      for (const [index, [code, name]] of items.entries()) {
        await client.query(
          `
            INSERT INTO code_item(
              workspace_id, group_id, code, name, description, sort_order, is_active, metadata
            ) VALUES ($1, $2, $3, $4, NULL, $5, true, '{}'::jsonb)
            ON CONFLICT (group_id, code) DO UPDATE
            SET name = EXCLUDED.name,
                description = EXCLUDED.description,
                sort_order = EXCLUDED.sort_order,
                is_active = true,
                metadata = EXCLUDED.metadata,
                updated_at = now()
          `,
          [workspaceId, groupId, code, name, index + 1],
        );
      }
    }

    return { workspaceId };
  });
}
