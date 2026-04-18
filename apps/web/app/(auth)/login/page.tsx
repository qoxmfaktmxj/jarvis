'use client';

import { FormEvent, Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { User, Lock, CircleAlert, ArrowRight } from 'lucide-react';
import { TEMP_DEV_ACCOUNTS } from '@/lib/auth/dev-accounts';
import { Capy } from '@/components/layout/Capy';
import { GlobeLoader } from '@/components/layout/GlobeLoader';

const ERROR_MESSAGES: Record<string, string> = {
  user_not_found: '등록되지 않은 계정입니다. 관리자에게 문의하세요.',
  auth_failed: '로그인에 실패했습니다. 다시 시도해주세요.',
  invalid_credentials: '아이디 또는 비밀번호가 올바르지 않습니다.',
  missing_email: '이메일 또는 아이디/비밀번호를 입력해주세요.',
};

type DevRole = (typeof TEMP_DEV_ACCOUNTS)[number]['role'];

function LoginContent() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') ?? '/dashboard';
  const error = searchParams.get('error');
  const isDev = process.env.NODE_ENV !== 'production';
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [keepSignedIn, setKeepSignedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isLoading) return;
    setIsLoading(true);
    setLoginError(null);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setLoginError(payload?.error ?? '로그인에 실패했습니다.');
        setIsLoading(false);
        return;
      }

      const safeRedirect = redirectTo.startsWith('/') ? redirectTo : '/dashboard';
      window.location.assign(safeRedirect);
    } catch {
      setLoginError('로그인 요청 중 오류가 발생했습니다.');
      setIsLoading(false);
    }
  }

  function fillDevAccount(role: DevRole) {
    const account = TEMP_DEV_ACCOUNTS.find((a) => a.role === role);
    if (!account) return;
    setUsername(account.username);
    setPassword(account.password);
    setLoginError(null);
  }

  return (
    // Escape parent AuthLayout's max-w-md constraint with a fixed full-viewport wrapper.
    <div className="fixed inset-0 z-0 grid grid-cols-1 bg-surface-50 lg:grid-cols-2">
      {/* Left hero panel — desktop only */}
      <aside className="relative hidden overflow-hidden border-r border-surface-200 bg-white lg:flex lg:flex-col lg:px-16 lg:py-14">
        {/* Top: BrandMark dual (Jarvis + ISU lime dot) */}
        <div className="relative flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-7 w-7 rounded-md bg-gradient-to-br from-isu-400 to-isu-700"
              style={{
                boxShadow:
                  'inset 0 0 0 1px oklch(0.85 0.060 260 / 0.4), inset 0 -4px 8px oklch(0.15 0.080 260 / 0.6)',
              }}
            />
            <span className="text-display text-[20px] font-bold tracking-tight text-isu-900">
              Jarvis
            </span>
          </div>
          <span aria-hidden className="h-4 w-px bg-surface-300" />
          <span className="inline-flex items-center gap-1.5 rounded-full border border-surface-200 bg-surface-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-surface-700">
            ISU
            <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-lime-500" />
          </span>
        </div>

        {/* Bottom-aligned headline block */}
        <div className="relative z-10 mt-auto max-w-lg">
          <p className="text-display text-[11px] font-semibold uppercase tracking-[0.18em] text-surface-500">
            Internal portal · Knowledge compiler
          </p>
          <h1 className="mt-3 text-display text-[44px] font-bold leading-[1.1] tracking-tight text-surface-900">
            사내 지식을{' '}
            <span className="text-isu-600">[하나의 컴파일러]</span>로.
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-surface-500">
            문서·운영 기록·프로젝트 데이터를 언어 모델이 바로 읽을 수 있는 위키로 재구성합니다.
          </p>

          {/* Stats row */}
          <dl className="mt-12 flex flex-wrap items-center gap-x-6 gap-y-3 text-[12.5px] text-surface-600">
            <div className="flex items-baseline gap-1.5">
              <dt className="text-display font-bold tabular-nums text-surface-900">1,284</dt>
              <dd className="text-surface-500">문서</dd>
            </div>
            <span aria-hidden className="text-surface-300">
              ·
            </span>
            <div className="flex items-baseline gap-1.5">
              <dt className="text-display font-bold tabular-nums text-surface-900">4,920</dt>
              <dd className="text-surface-500">인용</dd>
            </div>
            <span aria-hidden className="text-surface-300">
              ·
            </span>
            <div className="flex items-baseline gap-1.5">
              <dt className="text-display font-bold tabular-nums text-surface-900">12.3s</dt>
              <dd className="text-surface-500">평균 응답</dd>
            </div>
          </dl>
        </div>

        {/* Capy hero — absolute right */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 top-20 opacity-70"
        >
          <Capy name="basic" size={340} priority />
        </div>
      </aside>

      {/* Right form panel */}
      <main className="relative flex items-center justify-center overflow-y-auto px-4 py-10 sm:px-8">
        <div className="w-full max-w-[380px] space-y-6">
          {/* Mobile wordmark (visible when left panel hidden) */}
          <div className="flex items-center justify-center gap-1.5 lg:hidden">
            <span
              aria-hidden
              className="inline-block h-6 w-6 rounded-md bg-gradient-to-br from-isu-500 to-isu-700"
            />
            <span className="text-display text-[18px] font-bold tracking-tight text-isu-700">
              Jarvis
            </span>
            <span aria-hidden className="ml-0.5 inline-block h-1.5 w-1.5 rounded-full bg-lime-500" />
          </div>

          {/* Heading */}
          <div className="space-y-2">
            <p className="text-display text-[11px] font-semibold uppercase tracking-[0.18em] text-surface-500">
              Sign in
            </p>
            <h2 className="text-display text-[26px] font-bold tracking-tight text-surface-900">
              계정으로 로그인
            </h2>
            <p className="text-[14px] leading-relaxed text-surface-500">
              ISU 사내 이메일로 발급된 계정을 사용하세요.
            </p>
          </div>

          {/* Redirect error strip */}
          {error && (
            <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
              <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{ERROR_MESSAGES[error] ?? `로그인 오류: ${error}`}</span>
            </div>
          )}

          {/* Dev amber strip */}
          {isDev && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] font-medium text-amber-800">
              <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>임시 개발 계정 — 배포 전 삭제 예정</span>
            </div>
          )}

          {/* Form */}
          <form className="space-y-4" onSubmit={handleLogin}>
            <div className="space-y-1.5">
              <label
                htmlFor="username"
                className="block text-display text-[10px] font-semibold uppercase tracking-[0.12em] text-surface-500"
              >
                아이디
              </label>
              <div className="relative">
                <User
                  aria-hidden
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400"
                />
                <input
                  id="username"
                  name="username"
                  autoComplete="username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  disabled={isLoading}
                  placeholder="admin"
                  className="flex h-10 w-full rounded-md border border-surface-300 bg-white pl-9 pr-3 text-sm text-surface-900 placeholder:text-surface-400 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-isu-400 focus-visible:border-isu-400 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="password"
                className="block text-display text-[10px] font-semibold uppercase tracking-[0.12em] text-surface-500"
              >
                비밀번호
              </label>
              <div className="relative">
                <Lock
                  aria-hidden
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400"
                />
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={isLoading}
                  placeholder="••••••••"
                  className="flex h-10 w-full rounded-md border border-surface-300 bg-white pl-9 pr-3 text-sm text-surface-900 placeholder:text-surface-400 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-isu-400 focus-visible:border-isu-400 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
            </div>

            {/* Persist + reset row */}
            <div className="flex items-center justify-between text-[12.5px]">
              <label
                htmlFor="keep-signed-in"
                className="inline-flex cursor-pointer items-center gap-2 text-surface-600"
              >
                <input
                  id="keep-signed-in"
                  type="checkbox"
                  checked={keepSignedIn}
                  onChange={(event) => setKeepSignedIn(event.target.checked)}
                  disabled={isLoading}
                  className="h-3.5 w-3.5 rounded border-surface-300 text-isu-600 focus-visible:ring-isu-400 focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                />
                <span>로그인 상태 유지</span>
              </label>
              <a
                href="mailto:it-support@isu.co.kr"
                className="inline-flex items-center gap-1 text-surface-500 hover:text-isu-600 hover:underline underline-offset-2"
              >
                비밀번호 재설정
                <ArrowRight aria-hidden className="h-3 w-3" />
              </a>
            </div>

            {/* Inline submit error */}
            {loginError && (
              <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
                <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{loginError}</span>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-surface-900 text-[14px] font-semibold text-white shadow-sm transition-colors hover:bg-surface-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-surface-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? (
                <>
                  <GlobeLoader size={18} tone="inverse" />
                  <span>로그인 중…</span>
                </>
              ) : (
                <span>로그인</span>
              )}
            </button>
          </form>

          {/* Test accounts */}
          {isDev && (
            <div className="space-y-2">
              <p className="text-display text-[10px] font-semibold uppercase tracking-[0.12em] text-surface-500">
                테스트 계정
              </p>
              <div className="grid grid-cols-3 gap-2">
                {TEMP_DEV_ACCOUNTS.map((account) => (
                  <button
                    key={account.role}
                    type="button"
                    onClick={() => fillDevAccount(account.role)}
                    disabled={isLoading}
                    className="group flex flex-col items-start gap-0.5 rounded-md border border-surface-200 bg-white px-2.5 py-2 text-left text-[11px] transition-colors hover:border-isu-300 hover:bg-isu-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-isu-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="text-display font-bold uppercase tracking-[0.08em] text-surface-900">
                      {account.role}
                    </span>
                    <span className="font-mono text-[11px] text-surface-700 tabular-nums">
                      {account.username}
                    </span>
                    <span className="font-mono text-[10.5px] text-surface-400 tabular-nums">
                      {account.password}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
