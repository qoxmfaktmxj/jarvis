-- Seed a fallback "system" workspace row used as audit_log.workspace_id
-- when the event has no real workspace context (e.g. login failures and
-- rate-limit triggers fired before authentication).
--
-- Without this row, audit_log INSERTs that use the zero-UUID fallback fail
-- the workspace_id FK constraint and are silently swallowed by the route
-- handler's `.catch(() => undefined)`, leaving brute-force attempts and
-- rate-limit hits invisible to operators.
--
-- workspace.code is UNIQUE(50). The "_system" sentinel is reserved and must
-- not be assigned to any tenant.

INSERT INTO workspace (id, code, name, settings)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  '_system',
  'System (audit fallback)',
  '{}'::jsonb
)
ON CONFLICT (id) DO NOTHING;
