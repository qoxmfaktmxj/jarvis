---
name: jarvis-i18n
description: Jarvis 프로젝트의 한국어 i18n(next-intl + apps/web/messages/ko.json) 키 추가·수정·검증 규칙. UI 문자열 추가, 번역 키 누락 복구, 보간 변수 일치 검증, 네임스페이스 구조 결정이 필요할 때 반드시 이 스킬을 사용하라. 하드코딩된 한국어 문자열 발견 시, ko.json에 키가 없다고 빌드 실패 시, t() 호출과 ko.json 경로가 안 맞을 때 트리거된다.
---

# Jarvis i18n Rules

Jarvis는 `next-intl`을 사용하며 `apps/web/messages/ko.json` 단일 파일로 한국어만 관리한다 (현재 멀티 로케일 없음). 이 스킬은 번역 키 추가·검증의 반복 오류를 막기 위한 참조다.

> **참고:** `apps/web/messages/en.json`이 리포에 존재하나 **실질적으로 비어 있음**이며 `apps/web/i18n/request.ts`가 `locale = 'ko'`로 하드코딩되어 있어 로딩되지 않는다. 멀티 로케일을 실제로 활성화하려면 별도 설계 결정이 필요하다. 현재는 `ko.json`만 수정/검증 대상으로 본다.

## 절대 원칙

1. **UI의 한국어 텍스트는 하드코딩 금지.** 모든 문자열은 `t("Namespace.key")` 호출을 거친다.
2. **키 경로는 ko.json 파일 구조와 정확히 일치해야 한다.** 대소문자·단수/복수·점(.) 위치가 1자라도 다르면 런타임 에러.
3. **보간 변수는 양쪽이 같아야 한다.** ko.json이 `{count}`이면 컴포넌트도 `{ count: ... }`, `{total}`이 아니다.
4. **컴포넌트에서 쓰기 전에 ko.json에 키를 먼저 추가한다.** 순서가 반대면 개발 중 에러가 나서 시간 낭비.

## ko.json 구조

최상위 네임스페이스는 **PascalCase**, 하위 섹션/키도 **PascalCase** 또는 **camelCase**로 일관성 있게:

```json
{
  "Admin": {
    "nav": {
      "title": "관리자",
      "users": "사용자"
    },
    "Users": {
      "title": "사용자",
      "description": "워크스페이스 멤버, 역할, 조직을 관리합니다.",
      "columns": {
        "employeeId": "사번",
        "name": "이름"
      },
      "status": {
        "active": "활성",
        "inactive": "비활성"
      },
      "total": "전체 {count}건"
    }
  },
  "Knowledge": {
    "Detail": {
      "pin": "고정",
      "unpin": "고정 해제",
      "pinnedAt": "{date}에 고정됨"
    }
  }
}
```

**규칙:**
- **최상위 = 도메인** (`Admin`, `Knowledge`, `Projects`, `Systems`, `Dashboard`, `Ask`, `Search`, `Attendance`, `Profile`, `Common`)
- **2단계 = 페이지/섹션** (`Users`, `Detail`, `Form`)
- **3단계 = 서브그룹 또는 실제 키** (`columns`, `status`, 또는 직접 `title`)
- 깊이 최대 4단계 권장. 그 이상이면 네이밍을 재검토.
- 재사용 가능한 공통 문자열(예: "취소", "저장", "삭제")은 `Common.actions.*`에 배치
- 에러 메시지는 `Common.errors.*` 또는 각 도메인의 `errors.*`
- **키 네이밍: camelCase** (`employeeId` ✅, `employee_id` ❌, `EmployeeId` ❌)

## 컴포넌트에서 사용

### Client Component
```tsx
"use client";
import { useTranslations } from "next-intl";

export function UserTable() {
  const t = useTranslations("Admin.Users");  // 네임스페이스 지정
  return (
    <div>
      <h1>{t("title")}</h1>
      <p>{t("description")}</p>
      <span>{t("total", { count: 42 })}</span>  {/* 보간 */}
    </div>
  );
}
```

### Server Component
```tsx
import { getTranslations } from "next-intl/server";

export default async function UsersPage() {
  const t = await getTranslations("Admin.Users");
  return <h1>{t("title")}</h1>;
}
```

**주의: `useTranslations`와 `getTranslations`는 서로 다르다.** client ↔ server 경계에서 잘못 쓰면 런타임 에러.

## 보간 변수 규칙

```json
{
  "Knowledge": {
    "Detail": {
      "pinnedAt": "{date}에 고정됨",
      "authorLine": "{name} · {time}"
    }
  }
}
```

```tsx
t("pinnedAt", { date: formatDate(page.pinnedAt) })
t("authorLine", { name: page.author, time: formatTime(page.createdAt) })
```

**규칙:**
- 변수명은 ko.json 쪽에 맞춘다. 컴포넌트가 `when`을 보내고 ko.json이 `{date}`이면 잘못된 것.
- 날짜/숫자는 컴포넌트 쪽에서 format하고 문자열을 전달 (ko.json은 포맷팅하지 않음)
- 복수형이 필요하면 next-intl의 ICU MessageFormat 사용: `"{count, plural, one {# 건} other {# 건}}"` (한국어는 단복수 구분 없으므로 대부분 불필요)

## 키 추가 워크플로우

1. **컴포넌트에서 필요한 키를 식별**: "이 화면에 `t("Knowledge.Detail.pin")`를 쓸 것"
2. **ko.json에서 해당 경로가 존재하는지 확인**
   - 있으면 재사용
   - 없으면 3단계로
3. **ko.json에 추가**: 기존 네임스페이스 구조를 따라 넣기
4. **컴포넌트에서 `t()` 호출**
5. **빌드/타입체크 실행**: `pnpm --filter @jarvis/web type-check` + 개발 서버에서 해당 화면 접속

## 경계면 검증 (리뷰 단계 / spec-reviewer용)

superpowers:subagent-driven-development의 spec-reviewer 또는 superpowers:requesting-code-review 실행 시 아래를 반드시 확인:

### 1. 컴포넌트 → ko.json 정방향
모든 `t("...")`, `useTranslations("...")`, `getTranslations("...")` 호출이 ko.json의 실제 경로와 일치하는가?

```bash
# 대략적인 검색 (Grep 도구 사용)
pattern: t\(["']([^"']+)["']
# 각 결과의 경로가 ko.json에 존재하는지 확인
```

### 2. ko.json → 컴포넌트 역방향
ko.json에 있지만 사용되지 않는 키 (dead key)? 기능 수정 후 남은 쓰레기 키는 정리한다.

### 3. 보간 변수 교차 검증
```bash
# ko.json에서 {...} 패턴 추출
# 컴포넌트 호출부의 두 번째 인자 객체 키 비교
```

자동화가 어렵다면 최소한 기능 관련 키에 대해 수동 확인. `ProjectForm.tsx` 같은 복잡한 컴포넌트는 이전 세션에서 실제로 불일치가 발생한 적 있음.

## 흔한 실수

| 실수 | 증상 | 해결 |
|------|------|------|
| 하드코딩된 한국어 | 번역 불가능 / 일관성 결여 | 모든 문자열을 `t()`로 |
| ko.json에 키 없이 `t()` 호출 | 개발 중 경고, 프로덕션에서 키가 그대로 렌더링 | 먼저 ko.json에 추가 |
| 네임스페이스 미지정 | `t("Admin.Users.title")` 전체 경로 반복 | `useTranslations("Admin.Users")`로 스코프 지정 |
| 보간 변수 이름 불일치 | 변수가 치환 안 되고 `{date}` 그대로 표시 | ko.json과 컴포넌트 변수명 통일 |
| client/server 함수 혼동 | `useTranslations`를 서버에서 호출 | 서버는 `getTranslations`, 클라이언트는 `useTranslations` |
| 중첩 깊이 5단계+ | 키 경로 관리 어려움 | 4단계 이내로 재구성 |
| 공통 문자열 중복 | "취소"가 `Common.cancel` + `Admin.cancel`로 중복 | `Common.actions.cancel`로 통합 |

## 검증 스니펫

### 특정 파일의 모든 t() 호출 추출
```bash
# Grep 도구 사용
pattern: t\(["']([^"']+)["']
glob: apps/web/**/*.tsx
output_mode: content
```

### ko.json에서 특정 키 존재 확인
Read 도구로 `apps/web/messages/ko.json`을 열고 JSON 경로를 따라 확인. JSON 구조가 커서 Read + 검색이 효율적.

### 보간 변수 패턴 추출
```bash
# ko.json 내 {variableName} 패턴
pattern: \{(\w+)\}
path: apps/web/messages/ko.json
```

## 파일 위치

- **단일 로케일**: `apps/web/messages/ko.json`
- **next-intl 설정**: `apps/web/i18n/` 하위
- **사용처**: `apps/web/app/**/*.tsx`, `apps/web/components/**/*.tsx`
