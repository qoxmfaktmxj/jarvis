# Jarvis 테마·Favicon·질문 Composer 설계

## 목표

현재 공개 Jarvis의 구조를 유지하면서 Capybara favicon, 3색 브랜드 테마, Light/Dark 모드, Codex형 질문 입력 동작을 추가한다. 참조 구현은 `C:\Users\kms\Desktop\dev\jarvis-gitlab\jarvis`이며, 현재 공개 저장소에 필요한 부분만 축소 이식한다.

## 확정 사항

- 기본 테마는 Blue다.
- 브랜드 테마는 Blue, Forest Green, Premium Red 세 가지로 제한한다.
- 색상값은 각각 `#2D8CDB`, `#176B4D`, `#A33A3A`를 사용한다.
- Light/Dark 모드와 브랜드 테마 선택은 브라우저에 저장하여 새로고침 후에도 유지한다.
- 질문 입력은 `Enter`로 전송하고 `Shift+Enter`로 줄바꿈한다.
- 한글 IME 조합 중 발생하는 Enter는 질문을 전송하지 않는다.
- 변경 완료 후 `main` 브랜치에 직접 푸시한다.

## 구성 요소

### Favicon

참조 저장소의 `apps/web/public/capybara/basic.png`를 현재 저장소의 동일한 public 경로로 복사한다. Root metadata의 icon을 `/capybara/basic.png`로 지정해 브라우저 탭에서 기본 Capybara가 표시되게 한다.

### 테마 상태

`apps/web/components/layout/uiPrefs.ts`가 다음 설정을 담당한다.

- `jv.theme`: `light | dark`
- `jv.themeColor`: `blue | forest | red`
- 설정 변경 시 `<html>`의 `data-theme`, `data-theme-color` 속성 동기화
- 변경 이벤트 발행
- hydration 전 적용할 bootstrap script 제공

Root layout은 bootstrap script를 먼저 실행하여 새로고침 시 테마가 뒤늦게 바뀌는 현상(FOUC)을 줄인다. 저장값이 없거나 잘못된 경우 `light + blue`로 복구한다.

### 테마 UI

Topbar에 다음을 추가한다.

- Blue, Forest Green, Premium Red를 선택하는 접근 가능한 3색 radio group
- 현재 Light/Dark 상태에 따라 달 또는 해 아이콘을 보여주는 전환 버튼
- 키보드 focus ring, `aria-label`, `aria-checked`, `aria-pressed`

현재 UserMenu와 인증·로그아웃 흐름은 변경하지 않는다.

### 전역 색상

`globals.css`의 기존 토큰 이름을 유지한다. 브랜드 선택은 `--brand-primary`와 hover 색상만 바꾸고, Light/Dark 선택은 배경·표면·텍스트·테두리·그림자 토큰을 바꾼다. 기존 컴포넌트는 동일 토큰을 사용하므로 개별 화면을 재작성하지 않는다.

Canvas 배경은 `<html>` 테마 속성 변경을 감지해 색을 다시 읽고 scene을 재생성한다. 따라서 새로고침이나 resize 없이도 배경 격자 색상이 즉시 바뀐다.

### 질문 Composer

현재 `AskPanel`의 API 및 SSE 처리 코드는 유지하고 입력 영역만 참조 Jarvis의 composer 구조로 정리한다.

- textarea를 얇은 테두리의 composer panel로 감싼다.
- 하단 toolbar에 `Enter 전송 · Shift+Enter 줄바꿈` 안내와 전송 아이콘 버튼을 둔다.
- 빈 질문 또는 전송 중에는 버튼과 Enter 전송을 막는다.
- `Enter` 단독 입력만 `preventDefault()` 후 기존 `submit()`을 호출한다.
- `Shift`, `Ctrl`, `Meta` 조합 또는 IME 조합 중 Enter는 textarea 기본 동작을 유지한다.
- 기존 답변, 출처, 오류 표시 및 conversation URL 갱신은 변경하지 않는다.

## 오류 및 접근성

- localStorage 접근 실패는 화면 동작을 막지 않고 기본 테마를 사용한다.
- 테마 버튼은 색상만으로 상태를 전달하지 않고 label과 checked 상태를 제공한다.
- 질문 textarea에는 기존 `질문` label을 유지한다.
- favicon에는 네트워크 요청이 필요하지 않다.

## 테스트

- 테마 기본값, 저장, `<html>` 속성 및 변경 이벤트를 unit test로 검증한다.
- 질문 키 판별은 `Enter`, `Shift+Enter`, modifier, IME 조합 케이스를 unit test로 먼저 고정한다.
- 기존 Ask E2E에 Enter 전송과 Shift+Enter 줄바꿈 시나리오를 추가한다.
- web 범위 `type-check`, `lint`, 관련 unit test를 실행한다.

## 영향 범위

- 변경: 전역 layout metadata, globals.css, Topbar, GridBackground, AskPanel, ko.json, web 테스트, Capybara 이미지 자산
- 변경 없음: DB, 권한, 세션, API 계약, Ask AI agent, Wiki-fs, 검색, worker, LLM 호출 및 budget

## 제외 범위

- 참조 Jarvis의 Command Palette, 탭 시스템, 모델 선택기, 토큰 게이지, 전체 대화 UI는 이식하지 않는다.
- UserMenu 구조와 기존 페이지 레이아웃은 재설계하지 않는다.
