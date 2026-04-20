// scripts/migrate/types.ts
// TypeScript interfaces matching Oracle column names (uppercase, as returned by oracledb)

export interface LegacyWorkspace {
  ENTER_CD: string;
}

export interface LegacyOrg {
  ENTER_CD: string;
  ORG_CD: string;
  ORG_NM: string;
}

export interface LegacyUser {
  ENTER_CD: string;
  SABUN: string;
  USER_NM: string;
  EMAIL: string;
  ORG_CD: string;
  ORG_NM: string;
  ROLE_CD: string;
  USE_YN: string;
  CHK_ID: string;
  CHK_DATE: Date;
}

export interface LegacyMenu {
  ENTER_CD: string;
  MENU_ID: string;
  MENU_NM: string;
  PARENT_MENU_ID: string | null;
  MENU_URL: string;
  MENU_ORDER: number;
  USE_YN: string;
  ICON: string | null;
  CHK_ID: string;
  CHK_DATE: Date;
}

export interface LegacyCodeGroup {
  ENTER_CD: string;
  GRCODE_CD: string;
  GRCODE_NM: string;
  USE_YN: string;
  SORT_ORDER: number;
  CHK_ID: string;
  CHK_DATE: Date;
}

export interface LegacyCodeItem {
  ENTER_CD: string;
  GRCODE_CD: string;
  CODE: string;
  CODE_NM: string;
  USE_YN: string;
  SORT_ORDER: number;
  ETC1: string | null;
  ETC2: string | null;
  ETC3: string | null;
  CHK_ID: string;
  CHK_DATE: Date;
}

export interface LegacyFile {
  ENTER_CD: string;
  FILE_SEQ: number;
  FILE_NM: string;
  FILE_PATH: string;
  FILE_SIZE: number;
  FILE_EXT: string;
  CHK_ID: string;
  CHK_DATE: Date;
}

export interface LegacyCompany {
  ENTER_CD: string;
  COMPANY_CD: string;
  OBJECT_DIV: string;
  COMPANY_NM: string;
  CEO_NM: string | null;
  BIZ_NO: string | null;
  ADDR: string | null;
  TEL: string | null;
  FAX: string | null;
  EMAIL: string | null;
  USE_YN: string;
  CHK_ID: string;
  CHK_DATE: Date;
}

export interface LegacyProject {
  ENTER_CD: string;
  PROJECT_ID: number;
  PROJECT_NM: string;
  PROJECT_DESC: string | null;
  STATUS_CD: string;
  START_DT: Date;
  END_DT: Date | null;
  COMPANY_CD: string | null;
  CHK_ID: string;
  CHK_DATE: Date;
}

export interface LegacyTask {
  ENTER_CD: string;
  REQUEST_COMPANY_CD: string;
  REQUEST_YM: string;
  REQUEST_SEQ: number;
  PROJECT_ID: number;
  TITLE: string;
  CONTENT: string | null;
  STATUS_CD: string;
  PRIORITY_CD: string;
  SABUN: string;
  DUE_DATE: Date | null;
  CHK_ID: string;
  CHK_DATE: Date;
}

export interface LegacyInquiry {
  ENTER_CD: string;
  IN_SEQ: number;
  PROJECT_ID: number;
  TITLE: string;
  CONTENT: string | null;
  STATUS_CD: string;
  SABUN: string;
  CHK_ID: string;
  CHK_DATE: Date;
}

export interface LegacyStaff {
  ENTER_CD: string;
  NO: number;
  PROJECT_ID: number;
  SABUN: string;
  ROLE_CD: string;
  CHK_ID: string;
  CHK_DATE: Date;
}

export interface LegacyInfraManage {
  ENTER_CD: string;
  SEQ: number;
  SYS_NM: string;
  TASK_GUBUN_CD: string;   // → system.category
  DEV_GB_CD: string;       // → system.environment
  LOGIN_INFO: string | null;        // CRITICAL: plain-text credential → secret_ref
  DB_CONNECT_INFO: string | null;   // CRITICAL: plain-text credential → secret_ref
  DB_USER_INFO: string | null;      // CRITICAL: plain-text credential → secret_ref
  VPN_FILE_SEQ: number | null;      // → secret_ref after file migration
  MEMO: string | null;
  USE_YN: string;
  CHK_ID: string;
  CHK_DATE: Date;
}

export interface LegacyInfraPage {
  ENTER_CD: string;
  SEQ: number;
  MANAGE_SEQ: number;   // FK → LegacyInfraManage.SEQ
  PAGE_CONTENT: string | null;
  CHK_DATE: Date;
  CHK_ID: string;
}

export interface LegacyAuditLog {
  LOG_ID: number;
  ENTER_CD: string;
  SABUN: string | null;
  LOG_DATE: Date;
  ACTION_CD: string;
  TARGET_TABLE: string | null;
  TARGET_ID: string | null;
  IP_ADDR: string | null;
  DETAIL: string | null;
}
