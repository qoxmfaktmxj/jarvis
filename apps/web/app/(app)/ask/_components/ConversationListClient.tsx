"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { MoreVertical, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ConversationSummary } from "@/lib/server/conversation-repository";
import { deleteConversation, renameConversation } from "../actions";

export function ConversationListClient({
  rows,
  activeConversationId,
}: {
  rows: ConversationSummary[];
  activeConversationId?: string;
}) {
  const t = useTranslations("Ask.Conversations");
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [renameRow, setRenameRow] = useState<ConversationSummary | null>(null);
  const [deleteRow, setDeleteRow] = useState<ConversationSummary | null>(null);
  const [title, setTitle] = useState("");
  const [failure, setFailure] = useState(false);

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuId(null);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuId(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  async function submitRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!renameRow) return;
    const result = await renameConversation(renameRow.id, title.trim());
    if (!result.ok) {
      setFailure(true);
      return;
    }
    setRenameRow(null);
    setFailure(false);
    router.refresh();
  }

  async function confirmDelete() {
    if (!deleteRow) return;
    const deletedId = deleteRow.id;
    const result = await deleteConversation(deletedId);
    if (!result.ok) {
      setFailure(true);
      return;
    }
    setDeleteRow(null);
    setFailure(false);
    if (deletedId === activeConversationId) {
      router.replace("/ask");
    } else {
      router.refresh();
    }
  }

  return (
    <aside className="hidden h-full min-h-0 flex-col overflow-hidden border-r border-[var(--border-default)] bg-[var(--bg-page)] md:flex">
      <div className="border-b border-[var(--border-default)] p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--fg-muted)]">{t("title")}</p>
          <Link href="/ask" aria-label={t("new")} className="rounded p-1 hover:bg-[var(--bg-surface)]">
            <Plus aria-hidden="true" className="h-4 w-4" />
          </Link>
        </div>
      </div>
      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
        {rows.map((row) => {
          const active = row.id === activeConversationId;
          const menuOpen = menuId === row.id;
          return (
            <div key={row.id} className="relative flex items-center" ref={menuOpen ? menuRef : undefined}>
              <Link
                href={`/ask/${row.id}`}
                aria-current={active ? "page" : undefined}
                className={`min-w-0 flex-1 truncate rounded-md px-3 py-2 text-sm transition-colors ${
                  active ? "bg-[var(--bg-surface)] text-[var(--brand-primary)]" : "hover:bg-[var(--bg-surface)]"
                }`}
              >
                {row.title ?? t("untitled")}
              </Link>
              <button
                type="button"
                aria-label={t("menu")}
                aria-expanded={menuOpen}
                onClick={() => setMenuId(menuOpen ? null : row.id)}
                className="rounded p-1 text-[var(--fg-muted)] hover:bg-[var(--bg-surface)] hover:text-[var(--fg-primary)]"
              >
                <MoreVertical aria-hidden="true" className="h-4 w-4" />
              </button>
              {menuOpen ? (
                <div className="absolute right-0 top-9 z-10 w-32 rounded-md border border-[var(--border-default)] bg-[var(--bg-page)] p-1 shadow-[var(--shadow-soft)]">
                  <button
                    type="button"
                    data-action="rename"
                    onClick={() => {
                      setMenuId(null);
                      setFailure(false);
                      setTitle(row.title ?? "");
                      setRenameRow(row);
                    }}
                    className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-[var(--bg-surface)]"
                  >
                    {t("rename")}
                  </button>
                  <button
                    type="button"
                    data-action="delete"
                    onClick={() => {
                      setMenuId(null);
                      setFailure(false);
                      setDeleteRow(row);
                    }}
                    className="w-full rounded px-2 py-1.5 text-left text-sm text-red-700 hover:bg-red-50"
                  >
                    {t("delete")}
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>

      <Dialog open={renameRow !== null} onOpenChange={(open) => !open && setRenameRow(null)}>
        <DialogContent aria-describedby={undefined}>
          <form onSubmit={submitRename}>
            <DialogHeader>
              <DialogTitle>{t("renameTitle")}</DialogTitle>
            </DialogHeader>
            <label className="mt-4 block text-sm font-medium" htmlFor="conversation-title">{t("renameLabel")}</label>
            <input
              id="conversation-title"
              aria-label={t("renameLabel")}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={200}
              className="mt-2 w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-page)] px-3 py-2 text-sm"
            />
            {failure ? <p role="alert" className="mt-2 text-sm text-red-700">{t("actionFailed")}</p> : null}
            <DialogFooter>
              <Button type="submit">{t("renameSave")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteRow !== null} onOpenChange={(open) => !open && setDeleteRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteTitle")}</DialogTitle>
            <DialogDescription>{t("deleteDescription")}</DialogDescription>
          </DialogHeader>
          {failure ? <p role="alert" className="mt-2 text-sm text-red-700">{t("actionFailed")}</p> : null}
          <DialogFooter>
            <Button data-action="confirm-delete" variant="danger" onClick={() => void confirmDelete()}>{t("deleteConfirm")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
