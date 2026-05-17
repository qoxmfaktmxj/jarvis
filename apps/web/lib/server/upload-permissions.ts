import { PERMISSIONS } from '@jarvis/shared/constants/permissions';

/**
 * Permissions that grant upload access. Any one suffices (OR-match).
 *
 * Covers: SALES contract upload, KNOWLEDGE raw_source attachments,
 * PROJECT additional-dev attachments, NOTICE attachments, MAINTENANCE attachments.
 *
 * ADMIN_ALL automatically passes via `hasAnyPermission` bypass.
 *
 * Domains explicitly excluded as of 2026-05-17 (no attachment workflow):
 * INFRA, DOC_NUM, FAQ, GRAPH, USER, SCHEDULE.
 * Add to this list if a new attachment workflow lands.
 */
export const UPLOAD_PERMISSIONS = [
  PERMISSIONS.SALES_ADMIN,
  PERMISSIONS.KNOWLEDGE_ADMIN,
  PERMISSIONS.PROJECT_ADMIN,
  PERMISSIONS.NOTICE_ADMIN,
  PERMISSIONS.MAINTENANCE_ADMIN,
] as const;
