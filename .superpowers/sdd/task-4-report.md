# Task 4 완료 보고

- Ask 대화 목록에 새 대화 `+`, 세로점 메뉴, 이름 변경과 확인형 삭제를 추가했다.
- 대화 변경은 server action의 세션/권한에서 workspaceId·userId를 얻고, repository는 workspaceId·userId·conversationId를 모두 조건으로 사용한다.
- 답변의 `[[slug]]` 및 wikiPath 근거 카드는 데스크톱 일반 클릭에서 Ask 우측 Wiki 패널을 열며, 모바일·키보드·수정키·중간 클릭은 기존 전체 페이지 이동을 유지한다.
- `wikiPath`가 있으면 canonical URL보다 내부 Wiki를 우선한다. 외부 공식 URL만 새 탭으로 유지한다.

검증:

```text
pnpm --filter @jarvis/web test -- lib/server/conversation-repository.test.ts app/(app)/ask/_components/ConversationListClient.test.tsx app/(app)/ask/_components/AskWorkspace.test.tsx
# 3 files, 16 tests passed

pnpm --filter @jarvis/web type-check
# passed
```

요청 범위에 따라 lint, RSC audit, wiki check, 전체 E2E는 실행하지 않았다.
