'use client';

import { FormEvent, Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { User, Lock, CircleAlert, ArrowRight } from 'lucide-react';
import { LoadingOverlay } from '@/components/layout/LoadingOverlay';
import { safeReturnUrl } from './_lib/safe-redirect';
import { ShaderBackground, SHADER_ACCENTS } from './_components/ShaderBackground';

const ERROR_MESSAGES: Record<string, string> = {
  user_not_found: '등록되지 않은 계정입니다. 관리자에게 문의하세요.',
  auth_failed: '로그인에 실패했습니다. 다시 시도해주세요.',
  invalid_credentials: '아이디 또는 비밀번호가 올바르지 않습니다.',
  missing_email: '이메일 또는 아이디/비밀번호를 입력해주세요.',
};

function LoginContent() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') ?? '/dashboard';
  const allowedHosts = (process.env.NEXT_PUBLIC_ALLOWED_RETURN_HOSTS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const error = searchParams.get('error');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [keepSignedIn, setKeepSignedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [accentColor, setAccentColor] = useState<string>(SHADER_ACCENTS[0]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isLoading) return;
    setIsLoading(true);
    setLoginError(null);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password, keepSignedIn }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setLoginError(payload?.error ?? '로그인에 실패했습니다.');
        setIsLoading(false);
        return;
      }

      const safeRedirect = safeReturnUrl(redirectTo, allowedHosts, '/dashboard');
      window.location.assign(safeRedirect);
    } catch {
      setLoginError('로그인 요청 중 오류가 발생했습니다.');
      setIsLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-0">
      <ShaderBackground
        onIndexPicked={(i) => setAccentColor(SHADER_ACCENTS[i] ?? SHADER_ACCENTS[0])}
      />

      {isLoading && <LoadingOverlay label="로그인 중…" />}

      <main className="relative z-10 flex min-h-screen items-center justify-center px-4 py-10">
        <div className="flex w-full max-w-[380px] flex-col items-center gap-8">
          {/* Brand — outlined letterforms, shader shows through transparent fill.
              Stroke color follows the active shader's accent. */}
          <h1
            aria-label="Jarvis"
            className="text-display select-none text-[72px] font-bold leading-none tracking-tighter transition-colors duration-500 sm:text-[84px]"
            style={{
              color: accentColor,
              WebkitTextStroke: `1px ${accentColor}`,
              WebkitTextFillColor: 'transparent',
            }}
          >
            Jarvis
          </h1>

          {/* Form card */}
          <div className="w-full rounded-2xl border border-white/20 bg-white/95 p-8 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.5)] backdrop-blur-xl sm:p-10">
            {/* Heading */}
            <div className="space-y-2 text-center">
              <h2 className="text-display text-[26px] font-bold tracking-tight text-(--fg-primary)">
                로그인
              </h2>
              <p className="text-[14px] leading-relaxed text-(--fg-secondary)">
                발급된 계정으로 로그인 할 수 있습니다.
              </p>
            </div>

          {/* Redirect error strip */}
          {error && (
            <div className="mt-5 flex items-start gap-2 rounded-md border border-(--color-red-200) bg-(--color-red-50) px-3 py-2 text-[12.5px] text-(--color-red-500)">
              <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{ERROR_MESSAGES[error] ?? `로그인 오류: ${error}`}</span>
            </div>
          )}

          {/* Form */}
          <form className="mt-6 space-y-4" onSubmit={handleLogin}>
            <div className="space-y-1.5">
              <label
                htmlFor="username"
                className="block text-display text-[10px] font-semibold uppercase tracking-[0.12em] text-(--fg-secondary)"
              >
                아이디
              </label>
              <div className="relative">
                <User
                  aria-hidden
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--fg-muted)"
                />
                <input
                  id="username"
                  name="username"
                  autoComplete="username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  disabled={isLoading}
                  placeholder="admin"
                  className="flex h-10 w-full rounded-md border border-(--border-default) bg-white pl-9 pr-3 text-sm text-(--fg-primary) placeholder:text-(--fg-muted) shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand-primary-bg) focus-visible:border-(--brand-primary) disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="password"
                className="block text-display text-[10px] font-semibold uppercase tracking-[0.12em] text-(--fg-secondary)"
              >
                비밀번호
              </label>
              <div className="relative">
                <Lock
                  aria-hidden
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--fg-muted)"
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
                  className="flex h-10 w-full rounded-md border border-(--border-default) bg-white pl-9 pr-3 text-sm text-(--fg-primary) placeholder:text-(--fg-muted) shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand-primary-bg) focus-visible:border-(--brand-primary) disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
            </div>

            {/* Persist + reset row */}
            <div className="flex items-center justify-between text-[12.5px]">
              <label
                htmlFor="keep-signed-in"
                className="inline-flex cursor-pointer items-center gap-2 text-(--fg-secondary)"
              >
                <input
                  id="keep-signed-in"
                  type="checkbox"
                  checked={keepSignedIn}
                  onChange={(event) => setKeepSignedIn(event.target.checked)}
                  disabled={isLoading}
                  className="h-3.5 w-3.5 rounded border-(--border-default) text-(--brand-primary-text) focus-visible:ring-(--brand-primary-bg) focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                />
                <span>로그인 상태 유지</span>
              </label>
              <Link
                href="/reset-password"
                className="inline-flex items-center gap-1 text-(--fg-secondary) hover:text-(--brand-primary-text) hover:underline underline-offset-2"
              >
                비밀번호 변경
                <ArrowRight aria-hidden className="h-3 w-3" />
              </Link>
            </div>

            {/* Inline submit error */}
            {loginError && (
              <div className="flex items-start gap-2 rounded-md border border-(--color-red-200) bg-(--color-red-50) px-3 py-2 text-[12.5px] text-(--color-red-500)">
                <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{loginError}</span>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-(--brand-primary) text-[14px] font-semibold text-white shadow-sm transition-colors hover:bg-(--brand-primary-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--border-focus) focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span>{isLoading ? '로그인 중…' : '로그인'}</span>
            </button>
          </form>
          </div>
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
