import type { ReactNode } from "react";
import { PageHeader } from "./PageHeader";

/**
 * PageShell — 전역 페이지 표준 wrapper. 모든 `(app)` 라우트의 page.tsx는
 * 이 컴포넌트를 통해 PageHeader + content 영역을 일관된 구조로 렌더한다.
 *
 * 두 가지 모드:
 *  - `<PageShell>` (자연 height) — 컨텐츠가 페이지 height을 초과하면
 *    AppShellMain wrapper의 `overflow-y-auto`가 페이지 스크롤을 처리. 기본값.
 *    e.g. 공지 / 지식 본문 / 폼 등.
 *  - `<PageShellFit>` (viewport-fit) — 페이지가 항상 viewport 안에 fit.
 *    페이지 자체 스크롤 X, 내부 위젯(그리드/채팅/등)만 자체 스크롤.
 *    e.g. 대시보드, 그리드형 admin 화면.
 *
 * 두 모드 모두:
 *  - PageHeader 30px h1 + actions slot 우측 정렬
 *  - 자식들 사이 12px gap (페이지 일관성)
 *  - 좌우 padding / max-w / 위 chrome은 AppShellMain 전역 프레임이 결정
 *    (페이지에서 mx-auto / max-w / px / py 사용 금지)
 */
type PageShellProps = {
  /** Page title — rendered by PageHeader. */
  title: string;
  /** PageHeader actions slot (buttons, badges, etc.). */
  actions?: ReactNode;
  children: ReactNode;
};

/** 자연 height — wrapper(overflow-y-auto)가 페이지 스크롤 처리. */
export function PageShell({ title, actions, children }: PageShellProps) {
  return (
    <div className="space-y-3">
      <PageHeader title={title} actions={actions} />
      {children}
    </div>
  );
}

/** viewport-fit — 페이지 자체 스크롤 X, 내부 위젯만 스크롤. */
export function PageShellFit({ title, actions, children }: PageShellProps) {
  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden">
      <PageHeader title={title} actions={actions} />
      {children}
    </div>
  );
}
