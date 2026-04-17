import Link from 'next/link';
import { Lock } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/patterns/EmptyState';
import { Button } from '@/components/ui/button';

/**
 * apps/web/app/forbidden.tsx
 *
 * T6 — Next.js 15.1+ `forbidden()` API 가 렌더하는 전역 403 페이지.
 *
 * - 서버 컴포넌트에서 `forbidden()` 이 호출되면 Next.js 가 이 파일을 찾아
 *   HTTP 403 과 함께 이 트리를 렌더한다.
 * - 200+content (이전 방식) 과 달리 실제 403 상태코드가 내려가 브라우저/
 *   CDN/로봇이 권한 실패를 올바르게 인식한다.
 * - i18n: Wiki 네임스페이스의 `accessDenied` 메시지를 재사용.
 */
export default async function Forbidden() {
  const t = await getTranslations('Wiki');
  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <EmptyState
        icon={Lock}
        title={t('accessDenied')}
        description="403 Forbidden"
        action={
          <Button asChild>
            <Link href="/dashboard">대시보드로 이동</Link>
          </Button>
        }
      />
    </div>
  );
}
