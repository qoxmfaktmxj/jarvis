"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { updateQuickMenuOrder } from "@/app/actions/profile";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import type { MenuItem } from "@/lib/queries/dashboard";

export function QuickMenuEditor({
  initialItems
}: {
  initialItems: MenuItem[];
}) {
  const t = useTranslations("Profile.QuickMenu");
  const [items, setItems] = useState(initialItems);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function moveItem(index: number, direction: "up" | "down") {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= items.length) {
      return;
    }

    const nextItems = [...items];
    const currentItem = nextItems[index];
    const targetItem = nextItems[targetIndex];
    if (!currentItem || !targetItem) {
      return;
    }

    nextItems[index] = targetItem;
    nextItems[targetIndex] = currentItem;
    setItems(nextItems);
    setMessage(null);
  }

  function saveOrder() {
    startTransition(async () => {
      const result = await updateQuickMenuOrder(items.map((item) => item.id));
      setMessage(result.success ? t("saved") : result.error ?? t("saveFailed"));
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("empty")}
          </p>
        ) : (
          <ul className="space-y-2">
            {items.map((item, index) => (
              <li
                key={item.id}
                className="flex items-center justify-between rounded-xl border border-[--border-default] px-3 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.path}</p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    aria-label={t("moveUp", { label: item.label })}
                    variant="ghost"
                    size="icon"
                    disabled={index === 0 || isPending}
                    onClick={() => moveItem(index, "up")}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    aria-label={t("moveDown", { label: item.label })}
                    variant="ghost"
                    size="icon"
                    disabled={index === items.length - 1 || isPending}
                    onClick={() => moveItem(index, "down")}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {message ? (
          <p
            className={`text-sm ${
              message === t("saved") ? "text-[--status-success-fg]" : "text-[--color-red-500]"
            }`}
          >
            {message}
          </p>
        ) : null}
      </CardContent>
      <CardFooter className="flex justify-end">
        <Button disabled={isPending || items.length === 0} onClick={saveOrder}>
          {isPending ? t("saving") : t("save")}
        </Button>
      </CardFooter>
    </Card>
  );
}
