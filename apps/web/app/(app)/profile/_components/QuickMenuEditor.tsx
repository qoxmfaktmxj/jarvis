"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { updateQuickMenuOrder } from "@/app/actions/profile";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import type { MenuItem } from "@/lib/queries/dashboard";

export function QuickMenuEditor({
  initialItems
}: {
  initialItems: MenuItem[];
}) {
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
      setMessage(result.success ? "Order saved." : result.error ?? "Save failed.");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick Menu Order</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-gray-500">
            No quick menu items are available for your current roles.
          </p>
        ) : (
          <ul className="space-y-2">
            {items.map((item, index) => (
              <li
                key={item.id}
                className="flex items-center justify-between rounded-xl border border-gray-200 px-3 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">{item.label}</p>
                  <p className="text-xs text-gray-500">{item.path}</p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    aria-label={`Move ${item.label} up`}
                    variant="ghost"
                    size="icon"
                    disabled={index === 0 || isPending}
                    onClick={() => moveItem(index, "up")}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    aria-label={`Move ${item.label} down`}
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
              message === "Order saved." ? "text-emerald-600" : "text-rose-600"
            }`}
          >
            {message}
          </p>
        ) : null}
      </CardContent>
      <CardFooter className="flex justify-end">
        <Button disabled={isPending || items.length === 0} onClick={saveOrder}>
          {isPending ? "Saving..." : "Save Order"}
        </Button>
      </CardFooter>
    </Card>
  );
}
