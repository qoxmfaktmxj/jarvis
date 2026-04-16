// apps/web/app/(app)/architecture/components/SuggestedQuestions.tsx
'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

interface SuggestedQuestionsProps {
  questions: string[];
  snapshotId?: string;
}

export function SuggestedQuestions({ questions, snapshotId }: SuggestedQuestionsProps) {
  const t = useTranslations('Architecture.SuggestedQuestions');
  const router = useRouter();

  function buildUrl(q: string) {
    const params = new URLSearchParams({ q });
    if (snapshotId) params.set('snapshot', snapshotId);
    return `/ask?${params.toString()}`;
  }

  return (
    <div className="rounded-lg border border-border p-4">
      <h3 className="mb-2 font-semibold">{t('title')}</h3>
      {questions.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        <ul className="space-y-2">
          {questions.slice(0, 5).map((q, i) => (
            <li key={i}>
              <button
                className="text-left text-sm text-isu-600 hover:underline"
                onClick={() => router.push(buildUrl(q))}
              >
                {q}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
