'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, Suspense } from 'react';

const DEV_ACCOUNTS = [
  { email: 'admin@jarvis.dev', label: 'Admin User', role: 'ADMIN', color: 'bg-red-600 hover:bg-red-700' },
  { email: 'alice@jarvis.dev', label: 'Alice Kim', role: 'MANAGER', color: 'bg-emerald-600 hover:bg-emerald-700' },
  { email: 'bob@jarvis.dev', label: 'Bob Lee', role: 'VIEWER', color: 'bg-slate-600 hover:bg-slate-700' },
];

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') ?? '/dashboard';
  const error = searchParams.get('error');
  const [loading, setLoading] = useState<string | null>(null);

  const isDev = process.env.NODE_ENV !== 'production';

  async function devLogin(email: string) {
    setLoading(email);
    try {
      const res = await fetch('/api/auth/dev-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        router.push(redirectTo);
      } else {
        const data = await res.json() as { error?: string };
        alert(data.error ?? '로그인 실패');
      }
    } finally {
      setLoading(null);
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

      <a
        href={`/api/auth/login?redirect=${encodeURIComponent(redirectTo)}`}
        className="block w-full rounded-lg bg-blue-600 px-4 py-3 text-center font-medium text-white transition-colors hover:bg-blue-700"
      >
        SSO로 로그인
      </a>

      {isDev && (
        <div className="mt-6 border-t border-dashed border-gray-200 pt-5">
          <p className="mb-3 text-center text-xs font-medium uppercase tracking-wide text-gray-400">
            개발 환경 — 빠른 로그인
          </p>
          <div className="flex flex-col gap-2">
            {DEV_ACCOUNTS.map((acc) => (
              <button
                key={acc.email}
                onClick={() => devLogin(acc.email)}
                disabled={loading !== null}
                className={`flex items-center justify-between rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-colors disabled:opacity-60 ${acc.color}`}
              >
                <span>{acc.label}</span>
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs">{acc.role}</span>
                {loading === acc.email && <span className="ml-2 animate-pulse">...</span>}
              </button>
            ))}
          </div>
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
