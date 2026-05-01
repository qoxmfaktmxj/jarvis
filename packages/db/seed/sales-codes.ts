/**
 * packages/db/seed/sales-codes.ts
 *
 * 영업관리모듈 Phase 1 — 10개 코드 그룹 시드.
 * TBIZ100(고객사 마스터) 기준 코드 컬럼에서 사용되는 그룹.
 * 실제 Oracle 덤프 추출 전 placeholder 값 포함 — 운영 데이터 확보 후 갱신.
 */
import { sql } from "drizzle-orm";
import { db } from "../client.js";
import { codeGroup, codeItem } from "../schema/code.js";

type SeedItem = { code: string; name: string };
type SeedGroup = { code: string; name: string; items: SeedItem[] };

const SALES_CODE_GROUPS: SeedGroup[] = [
  {
    code: "SALES_CUST_KIND",
    name: "고객 종류",
    items: [
      { code: "01", name: "일반" },
      { code: "02", name: "VIP" },
      { code: "03", name: "파트너" },
      { code: "04", name: "잠재고객" },
      { code: "99", name: "기타" },
    ],
  },
  {
    code: "SALES_CUST_DIV",
    name: "고객 구분",
    items: [
      { code: "01", name: "법인" },
      { code: "02", name: "개인사업자" },
      { code: "03", name: "공공기관" },
      { code: "04", name: "기관" },
      { code: "99", name: "기타" },
    ],
  },
  {
    code: "SALES_EXCHANGE_TYPE",
    name: "거래 유형",
    items: [
      { code: "01", name: "직거래" },
      { code: "02", name: "채널" },
      { code: "03", name: "대리점" },
      { code: "04", name: "온라인" },
      { code: "99", name: "기타" },
    ],
  },
  {
    code: "SALES_CUST_SOURCE",
    name: "고객 소스",
    items: [
      { code: "01", name: "인바운드" },
      { code: "02", name: "아웃바운드" },
      { code: "03", name: "소개" },
      { code: "04", name: "전시/행사" },
      { code: "99", name: "기타" },
    ],
  },
  {
    code: "SALES_CUST_IMPR",
    name: "고객 인상",
    items: [
      { code: "01", name: "좋음" },
      { code: "02", name: "보통" },
      { code: "03", name: "나쁨" },
      { code: "04", name: "미확인" },
    ],
  },
  {
    code: "SALES_BUY_INFO",
    name: "구매 정보",
    items: [
      { code: "01", name: "구매확정" },
      { code: "02", name: "검토중" },
      { code: "03", name: "보류" },
      { code: "04", name: "미정" },
    ],
  },
  {
    code: "SALES_BUY_INFO_DT",
    name: "구매 정보 일자",
    items: [
      { code: "01", name: "1개월내" },
      { code: "02", name: "3개월내" },
      { code: "03", name: "6개월내" },
      { code: "04", name: "1년내" },
      { code: "99", name: "미정" },
    ],
  },
  {
    code: "SALES_BUSINESS_KIND",
    name: "업종",
    items: [
      { code: "01", name: "제조" },
      { code: "02", name: "IT/SW" },
      { code: "03", name: "유통/물류" },
      { code: "04", name: "금융" },
      { code: "05", name: "공공기관" },
      { code: "06", name: "의료/제약" },
      { code: "07", name: "건설/부동산" },
      { code: "08", name: "서비스" },
      { code: "99", name: "기타" },
    ],
  },
  {
    code: "SALES_PRODUCT_TYPE",
    name: "제품 유형",
    items: [
      { code: "01", name: "ERP" },
      { code: "02", name: "HRM" },
      { code: "03", name: "SCM" },
      { code: "04", name: "CRM" },
      { code: "05", name: "BI/분석" },
      { code: "99", name: "기타" },
    ],
  },
  {
    code: "SALES_LICENSE_KIND",
    name: "라이센스 종류",
    items: [
      { code: "01", name: "영구" },
      { code: "02", name: "연간구독" },
      { code: "03", name: "월구독" },
      { code: "04", name: "사용자당" },
      { code: "05", name: "CPU당" },
      { code: "99", name: "기타" },
    ],
  },
  {
    code: "INFRA_DEV_GB",
    name: "환경구분",
    items: [
      { code: "01", name: "개발" },
      { code: "02", name: "스테이징" },
      { code: "03", name: "운영" },
    ],
  },
  {
    // 공통코드 마스터의 `업무구분` 컬럼에서 사용. legacy grpCdMgr.jsp의
    // getMainMuPrgMainMenuList lookup 대체. Phase-2 기본 라벨이며 운영 데이터
    // 확보 후 갱신 가능.
    code: "BIZ_DIVISION",
    name: "업무구분",
    items: [
      { code: "11", name: "공통" },
      { code: "21", name: "인사" },
      { code: "22", name: "급여" },
      { code: "23", name: "근태" },
      { code: "24", name: "복지" },
      { code: "25", name: "교육" },
      { code: "31", name: "조직" },
      { code: "41", name: "시스템" },
    ],
  },
  // Phase 2 — 영업기회/활동 코드 12종
  {
    code: "SALES_BIZ_STEP",
    name: "영업단계",
    items: [
      { code: "01", name: "발굴" },
      { code: "02", name: "접촉" },
      { code: "03", name: "제안" },
      { code: "04", name: "협상" },
      { code: "05", name: "계약" },
      { code: "06", name: "실패" },
      { code: "99", name: "기타" },
    ],
  },
  {
    code: "SALES_BIZ_IMP",
    name: "영업기회 중요도",
    items: [
      { code: "01", name: "최상" },
      { code: "02", name: "상" },
      { code: "03", name: "중" },
      { code: "04", name: "하" },
    ],
  },
  {
    code: "SALES_SALE_TYPE",
    name: "판매유형",
    items: [
      { code: "01", name: "직판" },
      { code: "02", name: "간판" },
      { code: "03", name: "OEM" },
      { code: "99", name: "기타" },
    ],
  },
  {
    code: "SALES_BIZ_TYPE",
    name: "사업유형",
    items: [
      { code: "01", name: "신규" },
      { code: "02", name: "갱신" },
      { code: "03", name: "확장" },
      { code: "99", name: "기타" },
    ],
  },
  {
    code: "SALES_BIZ_TYPE_DETAIL",
    name: "사업유형 상세",
    items: [
      { code: "01", name: "라이센스 신규" },
      { code: "02", name: "라이센스 갱신" },
      { code: "03", name: "유지보수" },
      { code: "04", name: "교육" },
      { code: "99", name: "기타" },
    ],
  },
  {
    code: "SALES_BIZ_OP_SOURCE",
    name: "영업기회 출처",
    items: [
      { code: "01", name: "인바운드" },
      { code: "02", name: "아웃바운드" },
      { code: "03", name: "소개" },
      { code: "04", name: "전시/행사" },
      { code: "05", name: "웹사이트" },
      { code: "99", name: "기타" },
    ],
  },
  {
    code: "SALES_INDUSTRY",
    name: "산업구분",
    items: [
      { code: "01", name: "제조" },
      { code: "02", name: "IT/SW" },
      { code: "03", name: "유통/물류" },
      { code: "04", name: "금융" },
      { code: "05", name: "공공기관" },
      { code: "06", name: "의료/제약" },
      { code: "07", name: "건설/부동산" },
      { code: "08", name: "서비스" },
      { code: "99", name: "기타" },
    ],
  },
  {
    code: "SALES_CONT_PER",
    name: "계약가능성",
    items: [
      { code: "01", name: "10%" },
      { code: "02", name: "30%" },
      { code: "03", name: "50%" },
      { code: "04", name: "70%" },
      { code: "05", name: "90%" },
    ],
  },
  {
    code: "SALES_BIZ_AREA",
    name: "영업지역",
    items: [
      { code: "01", name: "서울" },
      { code: "02", name: "경기" },
      { code: "03", name: "인천" },
      { code: "04", name: "강원" },
      { code: "05", name: "충청" },
      { code: "06", name: "전라" },
      { code: "07", name: "경상" },
      { code: "08", name: "제주" },
      { code: "09", name: "해외" },
      { code: "99", name: "기타" },
    ],
  },
  {
    code: "SALES_CUST_TYPE",
    name: "고객유형",
    items: [
      { code: "01", name: "기존" },
      { code: "02", name: "신규" },
      { code: "03", name: "잠재" },
    ],
  },
  {
    code: "SALES_ACT_TYPE",
    name: "영업활동 유형",
    items: [
      { code: "01", name: "전화" },
      { code: "02", name: "방문" },
      { code: "03", name: "이메일" },
      { code: "04", name: "회의" },
      { code: "05", name: "제안서 발송" },
      { code: "06", name: "데모" },
      { code: "99", name: "기타" },
    ],
  },
  {
    code: "SALES_ACCESS_ROUTE",
    name: "접근경로",
    items: [
      { code: "01", name: "직접 방문" },
      { code: "02", name: "전화" },
      { code: "03", name: "온라인" },
      { code: "04", name: "소개" },
      { code: "99", name: "기타" },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Phase 1A — 계약 도메인 12 코드 그룹 (TBIZ030 / TBIZ031 / TBIZ010 기준)
  //
  // 항목 출처:
  //   ① JSP 인라인 ComboText/ComboCode (SetColProperty) — 확정 값
  //   ② HTML <select> 직접 선언                         — 확정 값
  //   ③ TBIZ030 덤프 distinct 값 (ENTER_CD='ISU_ST')     — 코드 확인, 라벨 추론
  //   ④ Oracle CommonCode API (C10021/C10037 등)         — 덤프 미포함, TODO 라벨 추론
  //   ⑤ TBIZ010 덤프 전체 NULL (19행)                   — placeholder
  //   코드별 출처는 인라인 주석 참조.
  // ─────────────────────────────────────────────────────────────────────────

  {
    // ③ TBIZ030 distinct: 001, 002 (Oracle CommonCode C10004 — 덤프 미포함)
    // 계약구분이 001=신규계약 / 002=유지보수 패턴은 bizContractMgr.jsp 업무 로직에서
    // contGbCd==002 조건으로 "실적&매출" 분기를 하므로 아래와 같이 추론.
    // TODO: 사용자 검증 — 실제 Oracle C10004 코드명 확인 후 갱신
    code: "SALES_CONT_GB",
    name: "계약구분",
    items: [
      { code: "001", name: "신규계약" },
      { code: "002", name: "유지보수" },
    ],
  },
  {
    // ③ TBIZ030 distinct: 01,02,04,05,06,07,09,10,11,12 (Oracle CommonCode C10021)
    // 계약형태(mainContType): bizContractMgrDetailPop.jsp mainContType 변경 시
    //   contType 콤보가 재조회되는 구조. 라벨은 ISU_ST 사용 패턴·업계 관행으로 추론.
    // TODO: 사용자 검증 — Oracle C10021 실제 코드명 확인 후 갱신
    code: "SALES_MAIN_CONT_TYPE",
    name: "계약형태",
    items: [
      { code: "01", name: "라이선스" },
      { code: "02", name: "유지보수" },
      { code: "04", name: "SaaS" },
      { code: "05", name: "구축" },
      { code: "06", name: "교육" },
      { code: "07", name: "기타용역" },
      { code: "09", name: "임대" },
      { code: "10", name: "상품(H/W)" },
      { code: "11", name: "상품(S/W)" },
      { code: "12", name: "인프라" },
    ],
  },
  {
    // ① bizContractMgr.jsp SetColProperty: ComboText="|내부|외부|팀비용", ComboCode="|01|02|03"
    // bizContractMonthMgr.jsp 동일 패턴 확인 — 확정값
    code: "SALES_IN_OUT_TYPE",
    name: "내외구분",
    items: [
      { code: "01", name: "내부" },
      { code: "02", name: "외부" },
      { code: "03", name: "팀비용" },
    ],
  },
  {
    // ③ TBIZ030 distinct: 10, 20, 30 (Oracle CommonCode C10037 — 덤프 미포함)
    // 기업분류(companyType): 10=법인고객/20=외부거래처/30=협력사로 추론
    //   (dump 실제 데이터 상 10·20이 다수, 30이 소수)
    // TODO: 사용자 검증 — Oracle C10037 실제 코드명 확인 후 갱신
    code: "SALES_COMPANY_TYPE",
    name: "기업분류",
    items: [
      { code: "10", name: "법인고객" },
      { code: "20", name: "외부거래처" },
      { code: "30", name: "협력사" },
    ],
  },
  {
    // ② bizContractMgrDetailPop.jsp HTML <select>:
    //   <option value="H">고</option>
    //   <option value="M">중</option>
    //   <option value="L">저</option>
    //   TBIZ030 덤프 distinct SUC_PROB: H, M, L 확인
    code: "SALES_SUC_PROB",
    name: "수주확률",
    items: [
      { code: "H", name: "고" },
      { code: "M", name: "중" },
      { code: "L", name: "저" },
    ],
  },
  {
    // TBIZ031.BILL_TARGET_YN — CheckBox(TrueValue:Y/FalseValue:N)
    // mmContractMgrDetailPop.jsp "전표발행 대상" 컬럼. 코드그룹으로 등록해
    // 필터 드롭다운에서 Y/N 선택 가능하도록 유지.
    code: "SALES_BILL_TARGET_YN",
    name: "청구대상여부",
    items: [
      { code: "Y", name: "청구대상" },
      { code: "N", name: "비대상" },
    ],
  },
  {
    // bizContractMonthMgr.jsp rfcEndYn — CheckBox(TrueValue:Y/FalseValue:N)
    // "실적 생성 마감" 컬럼. 코드그룹으로 등록해 필터 드롭다운 지원.
    code: "SALES_RFC_END_YN",
    name: "실적마감여부",
    items: [
      { code: "Y", name: "마감" },
      { code: "N", name: "미마감" },
    ],
  },
  {
    // ⑤ TBIZ010.ATTEND_CD — 덤프 19행 전체 NULL. contractServMgr JSP에 Combo 없음.
    // 근태구분 placeholder: Oracle HR 시스템 연동 코드 추정.
    // TODO: 사용자 검증 — 실제 근태 코드 확인 후 갱신
    code: "SALES_ATTEND_CD",
    name: "근태구분",
    items: [
      { code: "01", name: "정규" },
      { code: "02", name: "파견" },
    ],
  },
  {
    // ⑤ TBIZ010.SKILL_CD — 덤프 19행 전체 NULL. contractServMgr JSP에 Combo 없음.
    // 기술구분 placeholder: 용역 인력 기술 등급/분류 코드 추정.
    // TODO: 사용자 검증 — 실제 기술 코드 확인 후 갱신
    code: "SALES_SKILL_CD",
    name: "기술구분",
    items: [
      { code: "01", name: "개발" },
      { code: "02", name: "분석/설계" },
    ],
  },
  {
    // ⑤ TBIZ010.CMMNC_CD — 덤프 19행 전체 NULL. contractServMgr JSP에 Combo 없음.
    // 통신구분 placeholder: 용역 인력 통신비 처리 코드 추정.
    // TODO: 사용자 검증 — 실제 통신 코드 확인 후 갱신
    code: "SALES_CMMNC_CD",
    name: "통신구분",
    items: [
      { code: "01", name: "포함" },
      { code: "02", name: "미포함" },
    ],
  },
  {
    // ⑤ TBIZ010.RSPONS_CD — 덤프 19행 전체 NULL. contractServMgr JSP에 Combo 없음.
    // 책임구분 placeholder: PM/PL/개발자 등 역할 책임 코드 추정.
    // TODO: 사용자 검증 — 실제 책임 코드 확인 후 갱신
    code: "SALES_RSPONS_CD",
    name: "책임구분",
    items: [
      { code: "01", name: "PM" },
      { code: "02", name: "PL" },
    ],
  },
  {
    // ① contractServMgr.jsp SetColProperty:
    //   ComboText="|직계약|업체계약", ComboCode="|01|02"
    //   TBIZ010.CPY_GB_CD 컬럼 (계약구분: 직계약 vs 업체 파견계약)
    code: "SALES_CPY_GB",
    name: "CPY계약구분",
    items: [
      { code: "01", name: "직계약" },
      { code: "02", name: "업체계약" },
    ],
  },
];

async function upsertCodeGroup(
  wsId: string,
  code: string,
  name: string,
): Promise<string> {
  const result = await db
    .insert(codeGroup)
    .values({ workspaceId: wsId, code, name })
    .onConflictDoUpdate({
      target: [codeGroup.workspaceId, codeGroup.code],
      set: { name: sql`excluded.name` },
    })
    .returning({ id: codeGroup.id });

  if (result[0]) return result[0].id;

  // Fallback: fetch existing id
  const [existing] = await db
    .select({ id: codeGroup.id })
    .from(codeGroup)
    .where(sql`${codeGroup.workspaceId} = ${wsId} AND ${codeGroup.code} = ${code}`)
    .limit(1);

  if (!existing) throw new Error(`code_group (${code}) not found after upsert`);
  return existing.id;
}

async function upsertCodeItems(
  groupId: string,
  items: SeedItem[],
): Promise<void> {
  if (items.length === 0) return;
  await db
    .insert(codeItem)
    .values(
      items.map((item, idx) => ({
        groupId,
        code: item.code,
        name: item.name,
        sortOrder: idx,
      })),
    )
    .onConflictDoUpdate({
      target: [codeItem.groupId, codeItem.code],
      set: { name: sql`excluded.name`, sortOrder: sql`excluded.sort_order` },
    });
}

export async function seedSalesCodes(wsId: string): Promise<void> {
  for (const group of SALES_CODE_GROUPS) {
    const groupId = await upsertCodeGroup(wsId, group.code, group.name);
    await upsertCodeItems(groupId, group.items);
    console.log(`[seed/sales-codes] ${group.code} (${group.name}): ${group.items.length}건`);
  }
  console.log(`[seed/sales-codes] ${SALES_CODE_GROUPS.length}개 그룹 완료`);
}
