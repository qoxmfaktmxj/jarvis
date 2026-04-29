'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { User, Lock, CircleAlert, CircleCheck, ArrowLeft } from 'lucide-react';
import { LoadingOverlay } from '@/components/layout/LoadingOverlay';
import { ShaderBackground, SHADER_ACCENTS } from '../login/_components/ShaderBackground';

export default function ResetPasswordPage() {
  const [username, setUsername] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [accentColor, setAccentColor] = useState<string>(SHADER_ACCENTS[0]);

  const passwordMismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isLoading) return;

    if (newPassword !== confirmPassword) {
      setError('새 비밀번호가 일치하지 않습니다.');
      return;
    }

    if (newPassword.length === 0) {
      setError('새 비밀번호를 입력하세요.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, currentPassword, newPassword, confirmPassword }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? '비밀번호 변경에 실패했습니다.');
        setIsLoading(false);
        return;
      }

      setSuccess(true);
    } catch {
      setError('요청 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-0">
      <ShaderBackground
        onIndexPicked={(i) => setAccentColor(SHADER_ACCENTS[i] ?? SHADER_ACCENTS[0])}
      />

      {isLoading && <LoadingOverlay label="변경 중…" />}

      <main className="relative z-10 flex min-h-screen items-center justify-center px-4 py-10">
        <div className="flex w-full max-w-[380px] flex-col items-center gap-8">
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

          <div className="w-full rounded-2xl border border-white/20 bg-white/95 p-8 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.5)] backdrop-blur-xl sm:p-10">
            <div className="space-y-2 text-center">
              <h2 className="text-display text-[26px] font-bold tracking-tight text-[--fg-primary]">
                비밀번호 변경
              </h2>
              <p className="text-[14px] leading-relaxed text-[--fg-secondary]">
                아이디와 현재 비밀번호를 확인 후 새 비밀번호로 변경합니다.
              </p>
            </div>

            {success ? (
              <div className="mt-6 flex flex-col items-center gap-4">
                <div className="flex items-center gap-2 rounded-md border border-[--color-green-200] bg-[--color-green-50] px-4 py-3 text-[13px] text-[--color-green-700] w-full">
                  <CircleCheck className="h-4 w-4 shrink-0" />
                  <span>비밀번호가 변경되었습니다.</span>
                </div>
                <Link
                  href="/login"
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[--brand-primary] text-[14px] font-semibold text-white shadow-sm transition-colors hover:bg-[--brand-primary-hover] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--border-focus] focus-visible:ring-offset-2"
                >
                  로그인으로 돌아가기
                </Link>
              </div>
            ) : (
              <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
                {/* 아이디 */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="username"
                    className="block text-display text-[10px] font-semibold uppercase tracking-[0.12em] text-[--fg-secondary]"
                  >
                    아이디
                  </label>
                  <div className="relative">
                    <User
                      aria-hidden
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[--fg-muted]"
                    />
                    <input
                      id="username"
                      name="username"
                      autoComplete="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      disabled={isLoading}
                      placeholder="아이디 입력"
                      className="flex h-10 w-full rounded-md border border-[--border-default] bg-white pl-9 pr-3 text-sm text-[--fg-primary] placeholder:text-[--fg-muted] shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--brand-primary-bg] focus-visible:border-[--brand-primary] disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </div>
                </div>

                {/* 현재 비밀번호 */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="currentPassword"
                    className="block text-display text-[10px] font-semibold uppercase tracking-[0.12em] text-[--fg-secondary]"
                  >
                    현재 비밀번호
                  </label>
                  <div className="relative">
                    <Lock
                      aria-hidden
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[--fg-muted]"
                    />
                    <input
                      id="currentPassword"
                      name="currentPassword"
                      type="password"
                      autoComplete="current-password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      disabled={isLoading}
                      placeholder="••••••••"
                      className="flex h-10 w-full rounded-md border border-[--border-default] bg-white pl-9 pr-3 text-sm text-[--fg-primary] placeholder:text-[--fg-muted] shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--brand-primary-bg] focus-visible:border-[--brand-primary] disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </div>
                </div>

                {/* 새 비밀번호 */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="newPassword"
                    className="block text-display text-[10px] font-semibold uppercase tracking-[0.12em] text-[--fg-secondary]"
                  >
                    새 비밀번호
                  </label>
                  <div className="relative">
                    <Lock
                      aria-hidden
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[--fg-muted]"
                    />
                    <input
                      id="newPassword"
                      name="newPassword"
                      type="password"
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      disabled={isLoading}
                      placeholder="••••••••"
                      className="flex h-10 w-full rounded-md border border-[--border-default] bg-white pl-9 pr-3 text-sm text-[--fg-primary] placeholder:text-[--fg-muted] shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--brand-primary-bg] focus-visible:border-[--brand-primary] disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </div>
                </div>

                {/* 새 비밀번호 확인 */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="confirmPassword"
                    className="block text-display text-[10px] font-semibold uppercase tracking-[0.12em] text-[--fg-secondary]"
                  >
                    새 비밀번호 확인
                  </label>
                  <div className="relative">
                    <Lock
                      aria-hidden
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[--fg-muted]"
                    />
                    <input
                      id="confirmPassword"
                      name="confirmPassword"
                      type="password"
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      disabled={isLoading}
                      placeholder="••••••••"
                      className={`flex h-10 w-full rounded-md border bg-white pl-9 pr-3 text-sm text-[--fg-primary] placeholder:text-[--fg-muted] shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--brand-primary-bg] disabled:cursor-not-allowed disabled:opacity-50 ${
                        passwordMismatch
                          ? 'border-[--color-red-400] focus-visible:border-[--color-red-400]'
                          : 'border-[--border-default] focus-visible:border-[--brand-primary]'
                      }`}
                    />
                  </div>
                  {passwordMismatch && (
                    <p className="text-[12px] text-[--color-red-500]">비밀번호가 일치하지 않습니다.</p>
                  )}
                </div>

                {error && (
                  <div className="flex items-start gap-2 rounded-md border border-[--color-red-200] bg-[--color-red-50] px-3 py-2 text-[12.5px] text-[--color-red-500]">
                    <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isLoading || passwordMismatch}
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[--brand-primary] text-[14px] font-semibold text-white shadow-sm transition-colors hover:bg-[--brand-primary-hover] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--border-focus] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isLoading ? '변경 중…' : '비밀번호 변경'}
                </button>

                <Link
                  href="/login"
                  className="flex items-center justify-center gap-1 text-[12.5px] text-[--fg-secondary] hover:text-[--brand-primary-text] hover:underline underline-offset-2"
                >
                  <ArrowLeft aria-hidden className="h-3 w-3" />
                  로그인으로 돌아가기
                </Link>
              </form>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
