# KST·Wiki·Sidebar·Ask UX Design

## 목표

Jarvis의 사용자 노출 시간을 한국 표준시로 통일하고, HR Wiki와 전역/Ask 사이드바를 기존 Jarvis의 검증된 UX 패턴에 맞춰 개선한다.

## 확정 UX

- 제품명은 모든 화면에서 `Jarvis`로 표시한다.
- 제품명은 `/dashboard` 링크이며 바로 옆에 `PanelLeftClose`/`PanelLeftOpen` 토글을 둔다.
- 전역 Sidebar는 데스크톱에서 expanded와 60px rail 사이를 전환하고 선택을 `localStorage`에 저장한다.
- `/ask`에 진입할 때 전역 Sidebar는 rail로 자동 접힌다. 같은 화면에서 사용자가 다시 펼칠 수 있고, 재차 강제 접지 않는다.
- Ask 대화 목록은 그대로 유지한다. `새 대화` 옆에 `+` 아이콘을 표시한다.
- 각 대화의 세로 점 메뉴에는 `이름 변경`과 `삭제`를 둔다. 삭제는 destructive 색상과 확인 절차를 사용한다.
- 활성 대화를 삭제하면 `/ask`로 이동한다.
- Ask 답변의 내부 Wiki 근거는 데스크톱 일반 클릭에서 오른쪽 split panel로 열고, 모바일·키보드·modifier click은 기존 전체 페이지 이동을 유지한다.
- `wikiPath`가 있는 근거는 공식 URL보다 내부 Wiki를 우선하며, Wiki 경로가 없는 공식 외부 출처만 새 탭으로 연다.
- HR Wiki는 페이지당 20건 서버 페이징을 사용한다.
- 데스크톱에서 Wiki 항목을 클릭하면 목록을 유지한 채 오른쪽 split panel이 열린다. 모바일 및 modifier click은 기존 상세 페이지 이동을 유지한다.
- Wiki 패널은 독립 스크롤과 닫기 버튼을 제공한다.
- 사용자에게 보이는 date-time은 `Asia/Seoul` 기준 `YYYY-MM-DD HH:mm:ss`로 표시한다. DB와 API의 UTC/ISO 저장 계약은 바꾸지 않는다.

## 아키텍처

### 시간 표시

`apps/web/lib/format-date-time.ts`에 순수 formatter를 만들고 사용자에게 시간을 렌더하는 대시보드와 관리자 그리드에서만 호출한다. PostgreSQL `timestamptz` 및 repository의 ISO 직렬화는 유지한다.

### 전역 Sidebar

현재 서버 컴포넌트는 번역 문자열과 메뉴를 준비하고, 새 client 컴포넌트가 pathname·접힘 상태·토글을 담당한다. 모바일의 기존 가로 메뉴는 유지하며 rail은 `lg` 이상에만 적용한다.

### Wiki

`listWikiPages`가 count와 limit/offset을 함께 처리해 `{ rows, total, page, totalPages }`를 반환한다. 상세 본문은 기존 `/api/wiki/page`를 통해 `GitRepo.readBlob`으로 읽는다. DB는 목록/메타 projection으로만 사용한다.

### Ask 대화 mutation

repository에 rename/delete owner-scoped 함수를 추가한다. 모든 mutation은 `workspaceId + userId + conversationId`를 조건으로 사용한다. server action은 세션의 값을 전달하고 경로를 revalidate한다. DB FK cascade로 메시지를 함께 삭제하므로 스키마 변경은 없다.

### Ask 근거 패널

두 Ask 라우트를 client workspace/provider로 감싸고, 답변 본문의 `[[slug]]`와 `wikiPath`가 있는 source card가 같은 path 기반 Wiki API를 사용해 오른쪽 패널을 연다. 공개 API는 published Wiki predicate를 강제하며 본문은 계속 Git disk SSoT에서 읽는다.

## 오류와 경계 처리

- 잘못된 시간 값은 빈 문자열로 렌더한다.
- Wiki page가 1 미만이면 1, 마지막 페이지보다 크면 마지막 페이지로 clamp한다.
- Wiki 패널 fetch 실패 시 패널 안에 오류 상태를 표시한다.
- 대화 이름은 trim 후 1~200자만 허용한다.
- 소유하지 않은 대화 rename/delete는 성공으로 취급하지 않는다.
- Wiki modifier click과 모바일 click은 브라우저 기본 이동을 방해하지 않는다.

## 테스트

- formatter 단위 테스트: UTC→KST, 초 포함, invalid 값.
- Sidebar 컴포넌트 테스트: 토글, 저장, Ask 진입 자동 rail, 다시 펼치기, dashboard 링크.
- Wiki loader 단위 테스트: count/offset/page clamp.
- Wiki UI 테스트: desktop click panel, 닫기, modifier click 유지.
- Conversation repository/action/UI 테스트: owner filter, rename validation, destructive delete, 활성 삭제 redirect.
- Ask 근거 패널 테스트: desktop pointer click, 닫기, 모바일·키보드·modifier fallback, fetch 실패.
- 최종 web unit, type-check, lint, RSC audit, 관련 Playwright E2E를 실행한다.

## 영향도

- DB 스키마/마이그레이션: 변경 없음.
- Validation: repository 내부 제목 검증만 추가, 공용 Zod 계약 변경 없음.
- 권한: 기존 `WIKI_READ`, `ASK_USE` 재사용.
- workspace 격리: Wiki는 세션 workspace, Ask mutation은 workspace+user 소유권 조건 유지.
- Wiki-fs: 읽기 경로만 재사용, disk SSoT/DB projection 원칙 유지.
- Ask AI/LLM: 모델 호출과 SSE 계약 변경 없음.
- 검색/worker/audit: 변경 없음.
- UI/i18n/tests: 변경 있음.
