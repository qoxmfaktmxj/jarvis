import type { ReactNode } from "react";
import { PageHeader } from "./PageHeader";

/**
 * PageShell — 전역 페이지 표준 wrapper. 모든 `(app)` 라우트의 page.tsx는
 * 이 컴포넌트를 통해 PageHeader + content 영역을 일관된 구조로 렌더한다.
 *
 * 두 가지 모드:
 *  - `<PageShell>` (자연 height) — 페이지 자체에서 스크롤 처리 (`h-full
 *    overflow-y-auto`). 공지·지식 본문·폼 등 자연 height 페이지.
 *  - `<PageShellFit>` (viewport-fit) — 페이지가 항상 viewport 안에 fit.
 *    `h-full overflow-hidden`. 페이지 자체 스크롤 X, 내부 위젯(그리드/채팅/
 *    등)만 자체 스크롤.
 *
 * AppShellMain wrapper는 `overflow-hidden`이라 PageShellFit은 절대 페이지
 * 스크롤 안 됨이 강제되고, PageShell은 자체 `overflow-y-auto`로 페이지 내부
 * 스크롤을 책임진다.
 *
 * 두 모드 모두:
 *  - 자식들 사이 12px gap
 *  - 좌우 padding / max-w / 위 chrome은 AppShellMain 전역 프레임이 결정
 *    (페이지에서 mx-auto / max-w / px / py 사용 금지)
 *
 * Header:
 *  - 기본: `title` (+ optional `actions`) → PageHeader 표준 30px h1 렌더.
 *  - 커스텀: `header` prop이 있으면 PageHeader 대신 그대로 렌더 (대시보드의
 *    inline greeting + mascot 같이 예외적 패턴용). title/actions는 무시됨.
 */
type PageShellProps = {
  /** Page title — rendered by PageHeader (기본). `header` 있으면 무시. */
  title?: string;
  /** PageHeader actions slot. `header` 있으면 무시. */
  actions?: ReactNode;
  /**
   * Custom header override — PageHeader 대신 그대로 렌더. dashboard 같이
   * inline mascot/mood 등 표준 PageHeader 패턴을 벗어날 때만 사용.
   */
  header?: ReactNode;
  children: ReactNode;
};

function renderHeader(props: PageShellProps): ReactNode {
  if (props.header !== undefined) return props.header;
  if (props.title !== undefined) {
    return <PageHeader title={props.title} actions={props.actions} />;
  }
  return null;
}

/** 자연 height — 페이지 내부 자체 스크롤. */
export function PageShell(props: PageShellProps) {
  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto">
      {renderHeader(props)}
      {props.children}
    </div>
  );
}

/**
 * viewport-fit — 페이지 자체 스크롤 X, 내부 위젯만 스크롤.
 *
 * children을 `flex min-h-0 flex-1 flex-col overflow-hidden` wrapper에
 * 감싸 PageHeader 차감 후 남은 viewport height을 정확히 children에 전달.
 * 이 wrapper가 없으면 children이 `h-full`로 부모 height의 100%를 차지
 * 하려 해 PageHeader와 합쳐서 viewport overflow → 페이지네이션/footer가
 * viewport 밖으로 밀려나는 시각 버그 발생. children의 자체 layout
 * (flex/grid/h-full 등)은 이 wrapper 안에서 정상 작동.
 */
export function PageShellFit(props: PageShellProps) {
  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden">
      {renderHeader(props)}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {props.children}
      </div>
    </div>
  );
}
