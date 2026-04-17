'use client';

import { FormEvent, Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { TEMP_DEV_ACCOUNTS } from '@/lib/auth/dev-accounts';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

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
    <Card className="relative">
      {isLoading && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-xl bg-background/80 backdrop-blur-[2px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm font-medium text-muted-foreground">로그인 중...</p>
        </div>
      )}
      <CardHeader className="text-center">
        <CardTitle>Jarvis</CardTitle>
        <CardDescription>사내 포털에 로그인하세요</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>
              {ERROR_MESSAGES[error] ?? `로그인 오류: ${error}`}
            </AlertDescription>
          </Alert>
        )}

        {isDev && (
          <Alert variant="warning">
            <AlertDescription className="font-semibold">
              임시 개발 계정, 배포 전에 삭제하세요.
            </AlertDescription>
          </Alert>
        )}

        <form className="space-y-4" onSubmit={handleLogin}>
          <div className="space-y-1.5">
            <Label htmlFor="username">아이디</Label>
            <Input
              id="username"
              name="username"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              disabled={isLoading}
              placeholder="admin"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">비밀번호</Label>
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
          </div>

          {loginError && (
            <Alert variant="destructive">
              <AlertDescription>{loginError}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" disabled={isLoading} className="w-full">
            로그인
          </Button>
        </form>

        {isDev && (
          <div className="space-y-3">
            {TEMP_DEV_ACCOUNTS.map((account) => (
              <div
                key={account.username}
                className="rounded-lg border bg-surface-50 px-4 py-3 text-sm text-surface-700"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="font-medium text-surface-900">{account.label}</div>
                  <Badge variant="secondary">{account.role}</Badge>
                </div>
                <dl className="mt-3 space-y-1">
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-surface-500">아이디</dt>
                    <dd className="font-mono text-surface-900">{account.username}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-surface-500">비밀번호</dt>
                    <dd className="font-mono text-surface-900">{account.password}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-surface-500">매핑 이메일</dt>
                    <dd className="font-mono text-xs text-surface-600">{account.email}</dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
