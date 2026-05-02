"use client";
import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  listContactMemos,
  createContactMemo,
  deleteContactMemo,
} from "../actions";
import type { MemoTreeNode } from "@jarvis/shared/validation/sales/customer-contact-memo";

type Props = {
  contactId: string | null;
  contactName?: string;
  onClose: () => void;
  onCountChange?: () => void;
  /** When true, delete buttons render for ALL memos (admin override). Defaults to false. */
  isAdmin?: boolean;
};

export function MemoModal({
  contactId,
  contactName,
  onClose,
  onCountChange,
  isAdmin = false,
}: Props) {
  const t = useTranslations("Sales.CustomerContacts.Memo");
  const [tree, setTree] = useState<MemoTreeNode[]>([]);
  const [, startTransition] = useTransition();
  const [composing, setComposing] = useState<{ priorComtSeq: number } | null>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (!contactId) return;
    startTransition(async () => {
      const res = await listContactMemos({ contactId });
      if ("rows" in res) setTree(res.rows);
    });
  }, [contactId]);

  if (!contactId) return null;

  const reload = () => {
    startTransition(async () => {
      const res = await listContactMemos({ contactId });
      if ("rows" in res) setTree(res.rows);
      onCountChange?.();
    });
  };

  const submit = async () => {
    if (!composing || !draft.trim()) return;
    await createContactMemo({
      contactId,
      priorComtSeq: composing.priorComtSeq,
      memo: draft.trim(),
    });
    setDraft("");
    setComposing(null);
    reload();
  };

  const remove = async (comtSeq: number, isMaster: boolean) => {
    const msg = isMaster ? t("deleteMasterConfirm") : t("deleteReplyConfirm");
    if (!confirm(msg)) return;
    await deleteContactMemo({ contactId, comtSeq });
    reload();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="max-h-[80vh] w-[720px] overflow-y-auto rounded bg-white p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {t("title")} — {contactName ?? ""}
          </h2>
          <button onClick={onClose} aria-label="close">
            ✕
          </button>
        </div>

        {composing?.priorComtSeq === 0 ? (
          <div className="mb-4 rounded border bg-slate-50 p-3">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="w-full rounded border p-2 text-sm"
              rows={3}
              placeholder={t("memoPlaceholder")}
            />
            <button
              onClick={submit}
              className="mt-2 rounded bg-slate-900 px-3 py-1 text-sm text-white"
            >
              {t("createMaster")}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setComposing({ priorComtSeq: 0 })}
            className="mb-4 rounded bg-slate-900 px-3 py-1 text-sm text-white"
          >
            {t("createMaster")}
          </button>
        )}

        {tree.length === 0 ? (
          <p className="text-sm text-slate-500">{t("empty")}</p>
        ) : (
          <ul className="space-y-3">
            {tree.map((m) => (
              <li
                key={m.comtSeq}
                className="rounded border-l-4 border-slate-500 p-3"
              >
                <div className="flex justify-between text-sm">
                  <span className="font-medium">
                    {m.authorName ?? "(?)"} · {m.insdate}
                  </span>
                  {(m.isOwn || isAdmin) && (
                    <button
                      onClick={() => remove(m.comtSeq, true)}
                      className="text-xs text-rose-600"
                    >
                      {t("delete")}
                    </button>
                  )}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm">{m.memo}</p>
                <button
                  onClick={() => setComposing({ priorComtSeq: m.comtSeq })}
                  className="mt-2 text-xs text-slate-700"
                >
                  {t("createReply")}
                </button>

                {composing?.priorComtSeq === m.comtSeq && (
                  <div className="mt-2 rounded border bg-slate-50 p-2">
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      className="w-full rounded border p-2 text-sm"
                      rows={2}
                      placeholder={t("memoPlaceholder")}
                    />
                    <button
                      onClick={submit}
                      className="mt-1 rounded bg-slate-700 px-2 py-1 text-xs text-white"
                    >
                      {t("createReply")}
                    </button>
                  </div>
                )}

                {m.replies.length > 0 && (
                  <ul className="mt-2 space-y-2 border-t pt-2">
                    {m.replies.map((r) => (
                      <li
                        key={r.comtSeq}
                        className="ml-6 rounded border-l-2 border-slate-300 pl-3"
                      >
                        <div className="flex justify-between text-sm">
                          <span className="font-medium">
                            {r.authorName ?? "(?)"} · {r.insdate}
                          </span>
                          {(r.isOwn || isAdmin) && (
                            <button
                              onClick={() => remove(r.comtSeq, false)}
                              className="text-xs text-rose-600"
                            >
                              {t("delete")}
                            </button>
                          )}
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-sm">
                          {r.memo}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
