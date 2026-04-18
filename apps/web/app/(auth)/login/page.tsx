'use client';

import { FormEvent, Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertCircle, LogIn } from 'lucide-react';
import { TEMP_DEV_ACCOUNTS } from '@/lib/auth/dev-accounts';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Capy } from '@/components/layout/Capy';
import { GlobeLoader } from '@/components/layout/GlobeLoader';

const ERROR_MESSAGES: Record<string, string> = {
  user_not_found: '등록되지 않은 계정입니다. 관리자에게 문의하세요.',
  auth_failed: '로그인에 실패했습니다. 다시 시도해주세요.',
  invalid_credentials: '아이디 또는 비밀번호가 올바르지 않습니다.',
  missing_email: '이메일 또는 아이디/비밀번호를 입력해주세요.',
};

function LoginContent() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') ?? '/dashboard';
  const error = searchParams.get('error');
  const isDev = process.env.NODE_ENV !== 'production';
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
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

  return (
    // Escape parent AuthLayout's max-w-md constraint with a fixed full-viewport wrapper.
    <div className="fixed inset-0 z-0 grid grid-cols-1 bg-surface-50 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] xl:grid-cols-[minmax(0,1fr)_minmax(420px,480px)]">
      {/* Left hero panel — desktop only */}
      <aside
        className="relative hidden overflow-hidden bg-isu-950 lg:flex lg:flex-col lg:justify-between"
        aria-hidden
      >
        {/* Subtle radial glow — kept minimal per design system §1 */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(circle at 25% 20%, oklch(0.45 0.15 260 / 0.6) 0%, transparent 55%), radial-gradient(circle at 80% 85%, oklch(0.70 0.18 134 / 0.18) 0%, transparent 50%)',
          }}
        />

        {/* Wordmark top */}
        <div className="relative flex items-center gap-1.5 px-10 pt-10">
          <span
            aria-hidden
            className="inline-block h-7 w-7 rounded-md bg-gradient-to-br from-isu-400 to-isu-700"
            style={{
              boxShadow:
                'inset 0 0 0 1px oklch(0.85 0.060 260 / 0.4), inset 0 -4px 8px oklch(0.15 0.080 260 / 0.6)',
            }}
          />
          <span className="text-display text-[20px] font-bold tracking-tight text-white">
            Jarvis
          </span>
          <span
            aria-hidden
            className="ml-0.5 inline-block h-1.5 w-1.5 rounded-full bg-lime-400"
          />
        </div>

        {/* Capy centerpiece */}
        <div className="relative flex flex-1 items-center justify-center px-10">
          <div className="relative">
            <div
              aria-hidden
              className="absolute inset-0 -z-10 blur-3xl"
              style={{
                background: 'radial-gradient(circle, oklch(0.70 0.18 134 / 0.18) 0%, transparent 70%)',
              }}
            />
            <Capy name="basic" size={240} priority />
          </div>
        </div>

        {/* Tagline bottom */}
        <div className="relative px-10 pb-10">
          <p className="text-display text-[11px] font-semibold uppercase tracking-[0.18em] text-lime-300">
            이수시스템
          </p>
          <p className="mt-1 text-display text-[13px] font-medium text-surface-300">
            Internal Portal
          </p>
        </div>
      </aside>

      {/* Right form panel */}
      <main className="relative flex items-center justify-center overflow-y-auto px-4 py-10 sm:px-8">
        <div className="w-full max-w-md space-y-6">
          {/* Mobile wordmark (visible when left panel hidden) */}
          <div className="flex items-center justify-center gap-1.5 lg:hidden">
            <span
              aria-hidden
              className="inline-block h-6 w-6 rounded-md bg-gradient-to-br from-isu-500 to-isu-700"
            />
            <span className="text-display text-[18px] font-bold tracking-tight text-isu-700">
              Jarvis
            </span>
            <span
              aria-hidden
              className="ml-0.5 inline-block h-1.5 w-1.5 rounded-full bg-lime-500"
            />
          </div>

          {/* Form card — 4-part structure per design system §4-1 */}
          <div className="relative overflow-hidden rounded-md border border-surface-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
            {/* Loading overlay — scoped to card only */}
            {isLoading && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-white/80 backdrop-blur-[2px]">
                <GlobeLoader size={96} tone="brand" label="로그인 중…" />
              </div>
            )}

            {/* ① Header — icon badge + title + subtitle */}
            <div className="flex items-center gap-2.5 border-b border-surface-200 bg-surface-50/60 px-5 py-3">
              <span className="flex h-6 w-6 items-center justify-center rounded-[5px] bg-isu-50 text-isu-600 ring-1 ring-inset ring-isu-200">
                <LogIn className="h-3.5 w-3.5" />
              </span>
              <div>
                <h1 className="text-[13px] font-semibold text-surface-900">Jarvis 로그인</h1>
                <p className="text-[11px] text-surface-500">사내 포털에 로그인하세요</p>
              </div>
            </div>

            {/* ② Error strip (redirect error from query param) */}
            {error && (
              <div className="flex items-start gap-2 border-b border-red-200 bg-red-50 px-5 py-3 text-[12.5px] text-red-700">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{ERROR_MESSAGES[error] ?? `로그인 오류: ${error}`}</span>
              </div>
            )}

            {/* Dev notice strip */}
            {isDev && (
              <div className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-5 py-3 text-[12.5px] font-medium text-amber-800">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>임시 개발 계정, 배포 전에 삭제하세요.</span>
              </div>
            )}

            {/* ③ Body — form fields */}
            <form className="space-y-4 p-5" onSubmit={handleLogin}>
              <label htmlFor="username" className="block space-y-1.5">
                <span className="text-display text-[10px] font-semibold uppercase tracking-[0.12em] text-surface-500">
                  아이디
                </span>
                <Input
                  id="username"
                  name="username"
                  autoComplete="username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  disabled={isLoading}
                  placeholder="admin"
                />
              </label>

              <label htmlFor="password" className="block space-y-1.5">
                <span className="text-display text-[10px] font-semibold uppercase tracking-[0.12em] text-surface-500">
                  비밀번호
                </span>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={isLoading}
                  placeholder="admin123!"
                />
              </label>

              {/* Inline submit error strip */}
              {loginError && (
                <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{loginError}</span>
                </div>
              )}

              {/* ④ Footer — CTA (full width, size default for a primary auth action) */}
              <Button
                type="submit"
                disabled={isLoading}
                size="default"
                className="w-full"
              >
                로그인
              </Button>
            </form>
          </div>

          {/* Dev accounts reference card */}
          {isDev && (
            <div className="overflow-hidden rounded-md border border-surface-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
              <div className="border-b border-surface-200 bg-surface-50/60 px-5 py-3">
                <p className="text-display text-[10px] font-semibold uppercase tracking-[0.12em] text-surface-500">
                  Dev Accounts
                </p>
              </div>
              <div className="space-y-3 p-5">
                {TEMP_DEV_ACCOUNTS.map((account) => (
                  <div
                    key={account.username}
                    className="rounded-md border border-surface-200 bg-surface-50/50 px-4 py-3 text-[12.5px] text-surface-700"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="font-medium text-surface-900">{account.label}</div>
                      <Badge variant="secondary">{account.role}</Badge>
                    </div>
                    <dl className="mt-3 space-y-1">
                      <div className="flex items-center justify-between gap-4">
                        <dt className="text-surface-500">아이디</dt>
                        <dd className="font-mono text-surface-900 tabular-nums">{account.username}</dd>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <dt className="text-surface-500">비밀번호</dt>
                        <dd className="font-mono text-surface-900 tabular-nums">{account.password}</dd>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <dt className="text-surface-500">매핑 이메일</dt>
                        <dd className="font-mono text-[11.5px] text-surface-600">{account.email}</dd>
                      </div>
                    </dl>
                  </div>
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
