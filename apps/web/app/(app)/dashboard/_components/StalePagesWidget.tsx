import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { StalePage } from "@/lib/queries/dashboard";

export function StalePagesWidget({ pages }: { pages: StalePage[] }) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Stale Pages</CardTitle>
        {pages.length > 0 ? <Badge variant="destructive">{pages.length}</Badge> : null}
      </CardHeader>
      <CardContent>
        {pages.length === 0 ? (
          <p className="text-sm text-gray-500">All published pages are fresh.</p>
        ) : (
          <ul className="space-y-3">
            {pages.map((page) => (
              <li key={page.id} className="space-y-1">
                <Link
                  href={`/knowledge/${page.id}`}
                  className="line-clamp-2 text-sm font-medium text-gray-900 hover:text-blue-600"
                >
                  {page.title}
                </Link>
                <p className="text-xs text-rose-600">
                  {page.overdueDays}d overdue since {page.lastReviewedAt.toISOString().slice(0, 10)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
