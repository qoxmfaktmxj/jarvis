import type {
  MonthReportMasterRow,
  MonthReportDetailMonthRow,
  MonthReportDetailOtherRow,
} from "@jarvis/shared/validation/month-report";
import type { ServiceDeskIncident } from "@jarvis/db/schema";

export interface MonthlyReportData {
  master: MonthReportMasterRow & { companyName: string };
  monthDetail: MonthReportDetailMonthRow | null;
  otherDetail: MonthReportDetailOtherRow[];
  incidents: {
    processed: ServiceDeskIncident[];
    unsolved: ServiceDeskIncident[];
  };
  ym: string; // YYYYMM
  fontFaceCss?: string; // Optional inline @font-face injected by render-pdf
}

const baseCss = `
  @page { size: A4; margin: 24mm; }
  body { font-family: 'Pretendard', -apple-system, sans-serif; font-size: 11px; color: #1f2937; margin: 0; }
  h1 { font-size: 28px; text-align: center; margin: 60mm 0 4mm; font-weight: 700; }
  h2 { font-size: 16px; margin: 0 0 8mm; padding-bottom: 2mm; border-bottom: 2px solid #1f2937; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  th, td { border: 1px solid #cbd5e1; padding: 4px 6px; text-align: left; vertical-align: top; }
  th { background: #f1f5f9; font-weight: 600; }
  .cover-sub { text-align: center; font-size: 13px; color: #475569; }
  .pageno { text-align: center; font-size: 10px; color: #64748b; }
  .page-break { page-break-after: always; }
  section { padding: 0 0 12mm; }
`;

export function MonthlyReportTemplate(props: MonthlyReportData) {
  const { master, monthDetail, otherDetail, incidents, ym, fontFaceCss } = props;
  const ymDisplay = `${ym.substring(0, 4)}년 ${parseInt(ym.substring(4))}월`;

  return (
    <html lang="ko">
      <head>
        <meta charSet="utf-8" />
        <style dangerouslySetInnerHTML={{ __html: (fontFaceCss ?? "") + baseCss }} />
      </head>
      <body>
        <CoverPage companyName={master.companyName} ymDisplay={ymDisplay} />
        <SummaryStatsPage
          master={master}
          monthDetail={monthDetail}
          incidents={incidents}
          ymDisplay={ymDisplay}
        />
        {master.workTypeYn === "Y" && (
          <ProcessingDetailsSection
            incidents={incidents.processed}
            ymDisplay={ymDisplay}
          />
        )}
        {master.unsolvedYn === "Y" && (
          <UnsolvedDetailsSection
            incidents={incidents.unsolved}
            ymDisplay={ymDisplay}
          />
        )}
        <OtherSectionPage otherDetail={otherDetail} />
      </body>
    </html>
  );
}

function CoverPage({
  companyName,
  ymDisplay,
}: {
  companyName: string;
  ymDisplay: string;
}) {
  return (
    <section className="page-break">
      <h1>
        Customer Report
        <br />
        <span style={{ fontSize: 18 }}>(e-HR System)</span>
      </h1>
      <p className="cover-sub">- {companyName} -</p>
      <p className="cover-sub" style={{ marginTop: 32 }}>
        {ymDisplay}
      </p>
    </section>
  );
}

function SummaryStatsPage({
  master,
  monthDetail,
  incidents,
  ymDisplay,
}: {
  master: MonthlyReportData["master"];
  monthDetail: MonthReportDetailMonthRow | null;
  incidents: MonthlyReportData["incidents"];
  ymDisplay: string;
}) {
  const total = incidents.processed.length + incidents.unsolved.length;
  return (
    <section className="page-break">
      <h2>통계 요약 — {ymDisplay}</h2>
      <p>
        전체 인시던트: {total}건 (처리 {incidents.processed.length} / 미처리{" "}
        {incidents.unsolved.length})
      </p>
      {master.userCntYn === "Y" && monthDetail && (
        <table style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th>재직자</th>
              <th>퇴사자</th>
              <th>입사자</th>
              <th>급여인원</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{monthDetail.aaCnt ?? "-"}</td>
              <td>{monthDetail.raCnt ?? "-"}</td>
              <td>{monthDetail.newCnt ?? "-"}</td>
              <td>{monthDetail.cpnCnt ?? "-"}</td>
            </tr>
          </tbody>
        </table>
      )}
    </section>
  );
}

function ProcessingDetailsSection({
  incidents,
  ymDisplay,
}: {
  incidents: ServiceDeskIncident[];
  ymDisplay: string;
}) {
  return (
    <section className="page-break">
      <h2>처리내역 (상세) — {ymDisplay}</h2>
      <table>
        <thead>
          <tr>
            <th>NO</th>
            <th>등록번호</th>
            <th>요청자</th>
            <th>요청일</th>
            <th>요청내용</th>
            <th>처리내용</th>
            <th>시간</th>
            <th>완료일</th>
          </tr>
        </thead>
        <tbody>
          {incidents.length === 0 ? (
            <tr>
              <td
                colSpan={8}
                style={{ textAlign: "center", color: "#94a3b8" }}
              >
                (없음)
              </td>
            </tr>
          ) : (
            incidents.map((inc, i) => (
              <tr key={`${inc.seq}-${inc.higherCd}`}>
                <td>{i + 1}</td>
                <td>{inc.registerNum ?? ""}</td>
                <td>
                  {inc.requestNm ?? ""}{" "}
                  {inc.processNm ? `(${inc.processNm})` : ""}
                </td>
                <td>{inc.registerDate ?? ""}</td>
                <td>{inc.title ?? ""}</td>
                <td>
                  {[
                    inc.completeContent1,
                    inc.completeContent2,
                    inc.completeContent3,
                    inc.completeContent4,
                  ]
                    .filter(Boolean)
                    .join("")}
                </td>
                <td>{inc.workTime ?? ""}</td>
                <td>{inc.completeDate ?? ""}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  );
}

function UnsolvedDetailsSection({
  incidents,
  ymDisplay,
}: {
  incidents: ServiceDeskIncident[];
  ymDisplay: string;
}) {
  return (
    <section className="page-break">
      <h2>미처리내역 (상세) — {ymDisplay}</h2>
      <table>
        <thead>
          <tr>
            <th>NO</th>
            <th>등록번호</th>
            <th>요청자</th>
            <th>요청일</th>
            <th>요청내용</th>
            <th>시간</th>
            <th>완료예정일</th>
          </tr>
        </thead>
        <tbody>
          {incidents.length === 0 ? (
            <tr>
              <td
                colSpan={7}
                style={{ textAlign: "center", color: "#94a3b8" }}
              >
                (없음)
              </td>
            </tr>
          ) : (
            incidents.map((inc, i) => (
              <tr key={`${inc.seq}-${inc.higherCd}`}>
                <td>{i + 1}</td>
                <td>{inc.registerNum ?? ""}</td>
                <td>
                  {inc.requestNm ?? ""}{" "}
                  {inc.processNm ? `(${inc.processNm})` : ""}
                </td>
                <td>{inc.registerDate ?? ""}</td>
                <td>{inc.title ?? ""}</td>
                <td>{inc.workTime ?? ""}</td>
                <td>{inc.completeReserveDate ?? ""}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  );
}

function OtherSectionPage({
  otherDetail,
}: {
  otherDetail: MonthReportDetailOtherRow[];
}) {
  return (
    <section>
      <h2>기타사항</h2>
      <table>
        <thead>
          <tr>
            <th>구분</th>
            <th>제목</th>
            <th>내용</th>
          </tr>
        </thead>
        <tbody>
          {otherDetail.length === 0 ? (
            <tr>
              <td
                colSpan={3}
                style={{ textAlign: "center", color: "#94a3b8" }}
              >
                (없음)
              </td>
            </tr>
          ) : (
            otherDetail.map((o) => (
              <tr key={o.seq}>
                <td>{o.etcBizCd ?? ""}</td>
                <td>{o.etcTitle ?? ""}</td>
                <td>{o.etcMemo ?? ""}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  );
}
