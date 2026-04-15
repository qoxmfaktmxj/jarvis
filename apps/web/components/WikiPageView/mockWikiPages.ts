export type WikiPageMeta = {
  slug: string;
  title: string;
  sensitivity: 'public' | 'internal' | 'confidential';
  tags: string[];
  updatedAt: string;
  workspaceId: string;
};

export type WikiPage = WikiPageMeta & {
  content: string;
};

const DEFAULT_WORKSPACE = 'default';

export const MOCK_WIKI_PAGES: WikiPage[] = [
  {
    slug: 'hr/leaves/annual-leave',
    title: '연차휴가 정책',
    sensitivity: 'public',
    tags: ['HR', '휴가', '정책'],
    updatedAt: '2026-03-12T09:00:00.000Z',
    workspaceId: DEFAULT_WORKSPACE,
    content: `# 연차휴가 정책

연차휴가는 1년 이상 재직한 구성원에게 **15일**이 부여되며, 매년 1월 1일에 일괄 갱신됩니다.

## 신청 방법

1. 사내 포털에서 [[hr/leaves/annual-leave]] 신청서를 작성합니다.
2. 1차 결재(팀장) → 2차 결재(부서장) 순으로 진행됩니다.
3. 자세한 결재 라인은 [[process/approval/workflow]] 문서를 참고하세요.

> 사용하지 않은 연차는 회계연도 종료 시 소멸되며, 일부 잔여분은 수당으로 지급됩니다.`,
  },
  {
    slug: 'hr/leaves/sick-leave',
    title: '병가 신청 절차',
    sensitivity: 'public',
    tags: ['HR', '병가', '복지'],
    updatedAt: '2026-02-28T08:30:00.000Z',
    workspaceId: DEFAULT_WORKSPACE,
    content: `# 병가 신청 절차

업무 중 부상 또는 질병으로 인한 결근은 **병가**로 처리할 수 있습니다.

## 필요 서류

- 진단서 또는 소견서 (3일 이상 결근 시)
- 병가 신청서 (포털 양식)

## 절차

1. 결근 당일 오전 10시 전까지 팀장에게 통보합니다.
2. 복귀 후 3일 이내 진단서를 인사팀에 제출합니다.
3. 관련 복지는 [[hr/welfare/benefits]] 문서를 참조하세요.`,
  },
  {
    slug: 'it/vpn/setup',
    title: 'VPN 설정 가이드',
    sensitivity: 'public',
    tags: ['IT', 'VPN', '원격근무'],
    updatedAt: '2026-04-02T11:15:00.000Z',
    workspaceId: DEFAULT_WORKSPACE,
    content: `# VPN 설정 가이드

사외에서 사내 시스템에 접속하려면 VPN 클라이언트가 필요합니다.

## 설치 단계

1. IT 포털에서 \`OpenVPN Connect\` 최신 버전을 다운로드합니다.
2. 발급받은 \`.ovpn\` 프로필을 임포트합니다.
3. 사번과 OTP 비밀번호로 로그인합니다.

\`\`\`bash
sudo openvpn --config jarvis-corp.ovpn
\`\`\`

> 보안 관련 정책은 [[it/security/password-policy]] 문서를 참고하세요.`,
  },
  {
    slug: 'it/security/password-policy',
    title: '비밀번호 정책',
    sensitivity: 'internal',
    tags: ['IT', '보안', '정책'],
    updatedAt: '2026-03-25T14:00:00.000Z',
    workspaceId: DEFAULT_WORKSPACE,
    content: `# 비밀번호 정책

모든 사내 계정은 다음 기준을 만족해야 합니다.

- 최소 12자 이상
- 대문자/소문자/숫자/특수문자 중 3종 이상 조합
- 최근 사용한 5개 비밀번호와 중복 불가
- **90일마다 변경 의무**

다단계 인증(MFA)은 모든 관리자 계정에 강제되며, 일반 계정은 권장입니다.`,
  },
  {
    slug: 'hr/welfare/benefits',
    title: '복리후생 안내',
    sensitivity: 'public',
    tags: ['HR', '복지'],
    updatedAt: '2026-01-15T07:45:00.000Z',
    workspaceId: DEFAULT_WORKSPACE,
    content: `# 복리후생 안내

당사는 구성원의 삶의 질을 위해 다양한 복지 제도를 운영합니다.

## 주요 항목

| 항목 | 지원 내용 |
| --- | --- |
| 식대 | 월 20만원 |
| 통신비 | 월 5만원 |
| 자기계발비 | 연 100만원 |
| 건강검진 | 연 1회 |

자세한 휴가 관련 정책은 [[hr/leaves/annual-leave]] 페이지를 참고하세요.`,
  },
  {
    slug: 'process/purchase/request',
    title: '구매 요청 절차',
    sensitivity: 'public',
    tags: ['프로세스', '구매'],
    updatedAt: '2026-03-08T10:20:00.000Z',
    workspaceId: DEFAULT_WORKSPACE,
    content: `# 구매 요청 절차

업무용 물품/서비스 구매는 다음 절차를 따릅니다.

1. 사내 포털에서 **구매 요청서**를 작성합니다.
2. 견적서 1부 이상을 첨부합니다.
3. 결재 라인은 [[process/approval/workflow]] 기준을 따릅니다.
4. 승인 후 구매팀에서 발주를 진행합니다.

> 100만원 이상은 부서장 결재, 1,000만원 이상은 임원 결재가 필요합니다.`,
  },
  {
    slug: 'process/approval/workflow',
    title: '결재 라인 안내',
    sensitivity: 'public',
    tags: ['프로세스', '결재'],
    updatedAt: '2026-02-10T09:00:00.000Z',
    workspaceId: DEFAULT_WORKSPACE,
    content: `# 결재 라인 안내

문서 종류와 금액에 따라 결재 라인이 다르게 적용됩니다.

## 일반 결재

- 1차: 팀장
- 2차: 부서장
- 3차(필요 시): 임원

## 특수 결재

- 법무 검토가 필요한 문서는 [[legal/contracts/nda]] 절차를 추가로 거칩니다.
- 정보보안 관련 사안은 보안팀 사전 검토가 필수입니다.`,
  },
  {
    slug: 'org/teams/platform-engineering',
    title: '플랫폼 엔지니어링팀 소개',
    sensitivity: 'public',
    tags: ['조직', '엔지니어링'],
    updatedAt: '2026-04-05T13:30:00.000Z',
    workspaceId: DEFAULT_WORKSPACE,
    content: `# 플랫폼 엔지니어링팀

플랫폼 엔지니어링팀은 사내 개발 인프라와 공통 플랫폼을 책임집니다.

## 주요 업무

- 사내 CI/CD 파이프라인 운영
- 컨테이너 오케스트레이션(Kubernetes) 관리
- 개발자 포털(DevPortal) 구축 및 유지보수

## 협업 도구

- 업무 위키: 본 위키 시스템
- 이슈 트래커: Jira
- 사내 채팅: Slack`,
  },
  {
    slug: 'legal/contracts/nda',
    title: 'NDA 안내',
    sensitivity: 'confidential',
    tags: ['법무', '계약', 'NDA'],
    updatedAt: '2026-03-30T16:00:00.000Z',
    workspaceId: DEFAULT_WORKSPACE,
    content: `# NDA(비밀유지계약) 안내

외부 업체 또는 파트너와의 협업 시 NDA 체결이 필요합니다.

## 체결 절차

1. 법무팀에 표준 NDA 양식을 요청합니다.
2. 상대방 정보(상호, 대표자, 사업자번호)를 기입합니다.
3. 양사 서명 후 원본 1부씩 보관합니다.

> 본 문서는 **기밀** 등급으로 분류되어 권한이 있는 구성원만 열람할 수 있습니다.`,
  },
  {
    slug: 'index',
    title: '위키 인덱스',
    sensitivity: 'public',
    tags: ['인덱스', '목차'],
    updatedAt: '2026-04-14T18:00:00.000Z',
    workspaceId: DEFAULT_WORKSPACE,
    content: `# 위키 인덱스

전체 문서 목차입니다.

## HR

- [[hr/leaves/annual-leave]] — 연차휴가 정책
- [[hr/leaves/sick-leave]] — 병가 신청 절차
- [[hr/welfare/benefits]] — 복리후생 안내

## IT

- [[it/vpn/setup]] — VPN 설정 가이드
- [[it/security/password-policy]] — 비밀번호 정책

## 프로세스

- [[process/purchase/request]] — 구매 요청 절차
- [[process/approval/workflow]] — 결재 라인 안내

## 조직 / 법무

- [[org/teams/platform-engineering]] — 플랫폼 엔지니어링팀
- [[legal/contracts/nda]] — NDA 안내`,
  },
];
