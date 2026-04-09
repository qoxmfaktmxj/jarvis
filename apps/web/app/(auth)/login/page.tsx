'use client';

import { FormEvent, Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { TEMP_DEV_ACCOUNTS } from '@/lib/auth/dev-accounts';

function LoginContent() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') ?? '/dashboard';
  const error = searchParams.get('error');
  const isDev = process.env.NODE_ENV !== 'production';
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [devError, setDevError] = useState<string | null>(null);

  const ssoHref = useMemo(
    () => `/api/auth/login?redirect=${encodeURIComponent(redirectTo)}`,
    [redirectTo]
  );

  async function handleDevLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setDevError(null);

    try {
      const response = await fetch('/api/auth/dev-login', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          username,
          password,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setDevError(payload?.error ?? '로그인에 실패했습니다.');
        return;
      }

      window.location.assign(redirectTo);
    } catch {
      setDevError('로그인 요청 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="rounded-lg bg-white p-8 shadow-md">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-gray-900">Jarvis</h1>
        <p className="mt-1 text-gray-500">사내 포털에 로그인하세요</p>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          로그인 오류: {error}
        </div>
      )}

      {isDev ? (
        <div className="space-y-5">
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-semibold">임시 개발 계정, 배포 전에 삭제하세요.</p>
            <p className="mt-1 text-xs text-amber-800">
              로컬 확인은 이 화면에서 바로 로그인하고, 실제 SSO는 아래 버튼으로만 확인합니다.
            </p>
          </div>

          <form className="space-y-3" onSubmit={handleDevLogin}>
            <div className="space-y-1">
              <label htmlFor="username" className="block text-sm font-medium text-gray-700">
                아이디
              </label>
              <input
                id="username"
                name="username"
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                placeholder="admin"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                비밀번호
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                placeholder="admin123!"
              />
            </div>

            {devError && (
              <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{devError}</div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="block w-full rounded-lg bg-gray-900 px-4 py-3 text-center font-medium text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-400"
            >
              {isSubmitting ? '로그인 중...' : '개발 계정으로 로그인'}
            </button>
          </form>

          <div className="space-y-3">
            {TEMP_DEV_ACCOUNTS.map((account) => (
              <div
                key={account.username}
                className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="font-medium text-gray-900">{account.label}</div>
                  <div className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-semibold text-gray-700">
                    {account.role}
                  </div>
                </div>
                <dl className="mt-3 space-y-1">
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-gray-500">아이디</dt>
                    <dd className="font-mono text-gray-900">{account.username}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-gray-500">비밀번호</dt>
                    <dd className="font-mono text-gray-900">{account.password}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-gray-500">매핑 이메일</dt>
                    <dd className="font-mono text-xs text-gray-600">{account.email}</dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>

          <div className="border-t border-dashed border-gray-200 pt-5">
            <a
              href={ssoHref}
              className="block w-full rounded-lg bg-blue-600 px-4 py-3 text-center font-medium text-white transition-colors hover:bg-blue-700"
            >
              회사 계정으로 로그인
            </a>
            <p className="mt-2 text-center text-xs text-gray-500">
              SSO 플로우를 확인할 때만 인증 서버 로그인 화면으로 이동합니다.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <a
            href={ssoHref}
            className="block w-full rounded-lg bg-blue-600 px-4 py-3 text-center font-medium text-white transition-colors hover:bg-blue-700"
          >
            회사 계정으로 로그인
          </a>
          <p className="text-center text-xs text-gray-500">
            클릭하면 인증 서버 로그인 화면으로 바로 이동합니다.
          </p>
        </div>
      )}
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
