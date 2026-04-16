'use client';

import { FormEvent, Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { TEMP_DEV_ACCOUNTS } from '@/lib/auth/dev-accounts';

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
    <div className="relative rounded-lg bg-white p-8 shadow-md">
      {isLoading && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-lg bg-white/80 backdrop-blur-[2px]">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <p className="text-sm font-medium text-gray-600">로그인 중...</p>
        </div>
      )}
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-gray-900">Jarvis</h1>
        <p className="mt-1 text-gray-500">사내 포털에 로그인하세요</p>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {ERROR_MESSAGES[error] ?? `로그인 오류: ${error}`}
        </div>
      )}

      <div className="space-y-5">
        {isDev && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-semibold">임시 개발 계정, 배포 전에 삭제하세요.</p>
          </div>
        )}

        <form className="space-y-3" onSubmit={handleLogin}>
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
              disabled={isLoading}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-gray-50 disabled:text-gray-400"
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
              disabled={isLoading}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-gray-50 disabled:text-gray-400"
              placeholder="admin123!"
            />
          </div>

          {loginError && (
            <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{loginError}</div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="block w-full rounded-lg bg-gray-900 px-4 py-3 text-center font-medium text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-400"
          >
            로그인
          </button>
        </form>

        {isDev && (
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
        )}
      </div>
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
