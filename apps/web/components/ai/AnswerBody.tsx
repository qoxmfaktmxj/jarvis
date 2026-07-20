import Link from "next/link";

const CITE = /\[\[([a-z0-9-]{1,240})\]\]/gi;

export function AnswerBody({ text, slugToPath }: { text: string; slugToPath: Record<string, string> }) {
  const parts = text.split(CITE);
  return (
    <div data-testid="answer-text" className="space-y-3 whitespace-pre-wrap text-sm text-[var(--fg-primary)]">
      {parts.map((part, index) => {
        if (index % 2 === 1) {
          const path = slugToPath[part];
          return path ? (
            <Link key={`${part}-${index}`} href={`/wiki/${path.replace(/\.md$/, "")}`} className="font-medium text-[var(--brand-primary)] underline">
              {part}
            </Link>
          ) : (
            `[[${part}]]`
          );
        }
        return <span key={index}>{part}</span>;
      })}
    </div>
  );
}
