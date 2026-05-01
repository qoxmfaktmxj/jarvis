/**
 * packages/db/schema/infra-license.ts
 *
 * 인프라 운영 라이선스 (TBIZ500).
 *
 * 회사(company) × 환경(dev_gb_code: 01=개발/02=스테이징/03=운영) 단위로
 * 라이선스 시작/종료 + 도메인/IP + 사용자/법인 수 + 22 모듈 활성 여부 boolean을 보관.
 *
 * 22 모듈 boolean (legacy ibSheet 컬럼명 그대로):
 *   emp_yn 직원, hr_yn 인사, org_yn 조직, edu_yn 교육, pap_yn 급여, car_yn 차량,
 *   cpn_yn 쿠폰, tim_yn 근태, ben_yn 복리후생, app_yn 앱, eis_yn EIS, sys_yn 시스템,
 *   year_yn 연말정산, board_yn 게시판, wl_yn 워크플로우, pds_yn PDS, idp_yn IDP,
 *   abhr_yn 출퇴근/HR, work_yn 워크, sec_yn 보안, doc_yn 문서, dis_yn 파견.
 *
 * 감사 컬럼은 sales/* 컨벤션 (Phase-Sales P1.5): created_at/updated_at/created_by/updated_by.
 * user.id 로의 FK는 두지 않음 (sales/* 컨벤션 동일).
 */
import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const infraLicense = pgTable(
  "infra_license",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    companyId: uuid("company_id").notNull(),
    legacyCompanyCd: text("legacy_company_cd"),
    legacyCompanyNm: text("legacy_company_nm"),
    symd: date("symd").notNull(),
    eymd: date("eymd"),
    devGbCode: text("dev_gb_code").notNull(),
    domainAddr: text("domain_addr"),
    ipAddr: text("ip_addr"),
    userCnt: integer("user_cnt"),
    corpCnt: integer("corp_cnt"),
    empYn: boolean("emp_yn").notNull().default(false),
    hrYn: boolean("hr_yn").notNull().default(false),
    orgYn: boolean("org_yn").notNull().default(false),
    eduYn: boolean("edu_yn").notNull().default(false),
    papYn: boolean("pap_yn").notNull().default(false),
    carYn: boolean("car_yn").notNull().default(false),
    cpnYn: boolean("cpn_yn").notNull().default(false),
    timYn: boolean("tim_yn").notNull().default(false),
    benYn: boolean("ben_yn").notNull().default(false),
    appYn: boolean("app_yn").notNull().default(false),
    eisYn: boolean("eis_yn").notNull().default(false),
    sysYn: boolean("sys_yn").notNull().default(false),
    yearYn: boolean("year_yn").notNull().default(false),
    boardYn: boolean("board_yn").notNull().default(false),
    wlYn: boolean("wl_yn").notNull().default(false),
    pdsYn: boolean("pds_yn").notNull().default(false),
    idpYn: boolean("idp_yn").notNull().default(false),
    abhrYn: boolean("abhr_yn").notNull().default(false),
    workYn: boolean("work_yn").notNull().default(false),
    secYn: boolean("sec_yn").notNull().default(false),
    docYn: boolean("doc_yn").notNull().default(false),
    disYn: boolean("dis_yn").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
    createdBy: uuid("created_by"),
    updatedBy: uuid("updated_by"),
  },
  (t) => ({
    wsCompanySymdGbUniq: uniqueIndex("infra_license_ws_company_symd_gb_uniq").on(
      t.workspaceId,
      t.companyId,
      t.symd,
      t.devGbCode,
    ),
    wsCompanyIdx: index("infra_license_ws_company_idx").on(t.workspaceId, t.companyId),
  }),
);
