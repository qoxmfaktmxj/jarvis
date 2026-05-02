"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveOpportunities, listOpportunityMemos, createOpportunityMemo, deleteOpportunityMemo } from "@/app/(app)/sales/opportunities/actions";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { CodeGroupPopupLauncher, type CodeGroupItem } from "@/components/grid/CodeGroupPopupLauncher";
import { EmployeePicker } from "@/components/grid/EmployeePicker";
import { searchEmployees } from "@/lib/server/employees";
import type { MemoTreeNode } from "@jarvis/shared/validation/sales/opportunity-memo";

type OpportunityDetail = {
  id: string;
  bizOpNm: string;
  customerId: string | null;
  customerName: string | null;
  productTypeCode: string | null;
  bizStepCode: string | null;
  bizStepYmd: string | null;
  saleTypeCode: string | null;
  bizTypeCode: string | null;
  industryCode: string | null;
  bizAreaCode: string | null;
  bizOpSourceCode: string | null;
  contExpecAmt: number | null;
  contExpecYmd: string | null;
  contExpecSymd: string | null;
  contExpecEymd: string | null;
  orgNm: string | null;
  focusMgrYn: boolean;
  memo: string | null;
  insUserId: string | null;
  insUserName: string | null;
  insDate: string | null;
};

type Props = {
  opportunity: OpportunityDetail;
  codeOptions: {
    productType: CodeGroupItem[];
    bizStep: CodeGroupItem[];
    bizOpSource: CodeGroupItem[];
  };
};

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={["flex flex-col gap-1", full ? "md:col-span-2" : ""].join(" ")}>
      <label className="text-xs font-medium text-slate-600">{label}</label>
      {children}
    </div>
  );
}

function CodeField({ value, label, options, onChange }: { value: string | null; label: string; options: CodeGroupItem[]; onChange: (code: string | null) => void }) {
  const matched = options.find((o) => o.code === value);
  const display = matched ? `${matched.label} (${matched.code})` : (value ?? "");
  return (
    <div className="flex items-stretch gap-2">
      <input type="text" readOnly value={display} className="h-9 flex-1 rounded border border-slate-300 bg-slate-50 px-3 text-sm text-slate-700" />
      <CodeGroupPopupLauncher triggerLabel={label} items={options} searchable searchPlaceholder="코드/명칭 검색" onSelect={(it) => onChange(it.code)} />
      {value ? <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>지우기</Button> : null}
    </div>
  );
}

function MemoSection({ opportunityId }: { opportunityId: string }) {
  const [tree, setTree] = useState<MemoTreeNode[]>([]);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  const reload = () => {
    startTransition(async () => {
      const r = await listOpportunityMemos({ opportunityId });
      if ("rows" in r) setTree(r.rows as MemoTreeNode[]);
    });
  };

  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [opportunityId]);

  const handleAdd = () => {
    if (!draft.trim()) return;
    startTransition(async () => {
      const r = await createOpportunityMemo({ opportunityId, memo: draft, priorComtSeq: replyTo ?? 0 });
      if ("ok" in r && r.ok) {
        setDraft(""); setReplyTo(null); reload();
      } else { toast({ title: "메모 작성 실패" }); }
    });
  };

  const handleDelete = (comtSeq: number) => {
    if (!confirm("이 메모를 삭제하시겠습니까?")) return;
    startTransition(async () => {
      const r = await deleteOpportunityMemo({ opportunityId, comtSeq });
      if ("ok" in r && r.ok) reload();
      else toast({ title: "삭제 실패" });
    });
  };

  return (
    <div className="space-y-3" data-testid="opportunity-memo-section">
      <div className="rounded border border-slate-200 bg-slate-50 p-3">
        {replyTo != null ? (
          <div className="mb-2 flex items-center justify-between text-xs text-blue-700">
            <span>댓글 작성 중 (#{replyTo})</span>
            <button type="button" onClick={() => setReplyTo(null)} className="text-blue-700 underline">취소</button>
          </div>
        ) : null}
        <textarea className="w-full min-h-[80px] rounded border border-slate-300 px-3 py-2 text-sm" placeholder="새 메모..." value={draft} onChange={(e) => setDraft(e.target.value)} />
        <div className="mt-2 flex justify-end">
          <Button type="button" size="sm" onClick={handleAdd} disabled={isPending || !draft.trim()}>등록</Button>
        </div>
      </div>
      {tree.length === 0 ? (
        <div className="rounded border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">메모가 없습니다.</div>
      ) : (
        <ul className="space-y-2">
          {tree.map((m) => (
            <li key={m.comtSeq} className="rounded border border-slate-200 bg-white p-3">
              <div className="flex items-start justify-between text-xs text-slate-500">
                <span>#{m.comtSeq} · {m.authorName ?? "(작성자)"} · {m.insdate.slice(0, 16)}</span>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setReplyTo(m.comtSeq)} className="text-blue-600 hover:underline">답글</button>
                  {m.isOwn ? (<button type="button" onClick={() => handleDelete(m.comtSeq)} className="text-rose-600 hover:underline">삭제</button>) : null}
                </div>
              </div>
              <div className="mt-1 whitespace-pre-wrap text-sm text-slate-900">{m.memo}</div>
              {m.replies && m.replies.length > 0 ? (
                <ul className="mt-2 space-y-2 border-l-2 border-slate-200 pl-3">
                  {m.replies.map((r) => (
                    <li key={r.comtSeq} className="rounded bg-slate-50 p-2">
                      <div className="flex items-start justify-between text-xs text-slate-500">
                        <span>↳ #{r.comtSeq} · {r.authorName ?? "(작성자)"} · {r.insdate.slice(0, 16)}</span>
                        {r.isOwn ? (<button type="button" onClick={() => handleDelete(r.comtSeq)} className="text-rose-600 hover:underline">삭제</button>) : null}
                      </div>
                      <div className="mt-1 whitespace-pre-wrap text-sm text-slate-900">{r.memo}</div>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function OpportunityEditForm({ opportunity, codeOptions }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<"info" | "memo">("info");
  const [isPending, startTransition] = useTransition();

  const [draft, setDraft] = useState({
    bizOpNm: opportunity.bizOpNm ?? "",
    productTypeCode: opportunity.productTypeCode,
    bizStepCode: opportunity.bizStepCode,
    bizStepYmd: opportunity.bizStepYmd ?? "",
    bizOpSourceCode: opportunity.bizOpSourceCode,
    orgNm: opportunity.orgNm ?? "",
    focusMgrYn: opportunity.focusMgrYn,
    insUserId: opportunity.insUserId,
    contExpecAmt: opportunity.contExpecAmt != null ? String(opportunity.contExpecAmt) : "",
    contExpecYmd: opportunity.contExpecYmd ?? "",
  });
  const [insUserName, setInsUserName] = useState(opportunity.insUserName ?? "");

  function patch<K extends keyof typeof draft>(key: K, value: typeof draft[K]) {
    setDraft((p) => ({ ...p, [key]: value }));
  }

  function handleSave() {
    startTransition(async () => {
      const r = await saveOpportunities({
        creates: [],
        updates: [{
          id: opportunity.id,
          patch: {
            bizOpNm: draft.bizOpNm,
            productTypeCode: draft.productTypeCode,
            bizStepCode: draft.bizStepCode,
            bizStepYmd: draft.bizStepYmd || null,
            bizOpSourceCode: draft.bizOpSourceCode,
            orgNm: draft.orgNm || null,
            focusMgrYn: draft.focusMgrYn,
          },
        }],
        deletes: [],
      });
      if (r.ok) {
        toast({ title: "저장 완료" });
        router.push("/sales/opportunities");
      } else {
        const desc = "error" in r ? r.error : (r.errors?.[0]?.message ?? "알 수 없는 오류");
        toast({ title: "저장 실패", description: desc });
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 border-b border-slate-200">
        <button type="button" onClick={() => setTab("info")} className={tab === "info" ? "border-b-2 border-blue-500 px-4 py-2 text-sm font-semibold text-blue-700" : "px-4 py-2 text-sm text-slate-600 hover:text-slate-900"} data-testid="opportunity-tab-info">기본정보</button>
        <button type="button" onClick={() => setTab("memo")} className={tab === "memo" ? "border-b-2 border-blue-500 px-4 py-2 text-sm font-semibold text-blue-700" : "px-4 py-2 text-sm text-slate-600 hover:text-slate-900"} data-testid="opportunity-tab-memo">메모</button>
      </div>

      {tab === "info" ? (
        <div className="space-y-4 rounded-md border border-slate-200 bg-white p-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="영업기회명" full><input type="text" className="h-9 rounded border border-slate-300 px-3 text-sm" value={draft.bizOpNm} onChange={(e) => patch("bizOpNm", e.target.value)} /></Field>
            <Field label="조직"><input type="text" className="h-9 rounded border border-slate-300 px-3 text-sm" value={draft.orgNm} onChange={(e) => patch("orgNm", e.target.value)} /></Field>
            <Field label="고객사"><input type="text" className="h-9 rounded border border-slate-300 bg-slate-50 px-3 text-sm text-slate-700" value={opportunity.customerName ?? ""} readOnly /></Field>
            <Field label="등록자(사번)">
              <EmployeePicker
                value={insUserName}
                onSelect={(hit) => { patch("insUserId", hit.sabun); setInsUserName(`${hit.name} (${hit.sabun})`); }}
                search={(q, lim) => searchEmployees({ q, limit: lim })}
                placeholder="사번/이름 검색"
              />
            </Field>
            <Field label="제품유형"><CodeField value={draft.productTypeCode} label="제품유형" options={codeOptions.productType} onChange={(v) => patch("productTypeCode", v)} /></Field>
            <Field label="영업단계"><CodeField value={draft.bizStepCode} label="영업단계" options={codeOptions.bizStep} onChange={(v) => patch("bizStepCode", v)} /></Field>
            <Field label="단계 일자(YYYY-MM-DD)"><input type="text" className="h-9 rounded border border-slate-300 px-3 text-sm" value={draft.bizStepYmd} onChange={(e) => patch("bizStepYmd", e.target.value)} placeholder="2026-05-02" /></Field>
            <Field label="기회 출처"><CodeField value={draft.bizOpSourceCode} label="기회 출처" options={codeOptions.bizOpSource} onChange={(v) => patch("bizOpSourceCode", v)} /></Field>
            <Field label="계약예상금액"><input type="text" className="h-9 rounded border border-slate-300 bg-slate-50 px-3 text-sm text-slate-700" value={draft.contExpecAmt} readOnly /></Field>
            <Field label="계약예상년월"><input type="text" className="h-9 rounded border border-slate-300 bg-slate-50 px-3 text-sm text-slate-700" value={draft.contExpecYmd} readOnly /></Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={draft.focusMgrYn} onChange={(e) => patch("focusMgrYn", e.target.checked)} />
            집중관리 대상
          </label>
          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
            <Button variant="outline" onClick={() => router.push("/sales/opportunities")} disabled={isPending}>취소</Button>
            <Button onClick={handleSave} disabled={isPending} data-testid="opportunity-edit-save">{isPending ? "저장 중…" : "저장"}</Button>
          </div>
        </div>
      ) : (
        <div className="rounded-md border border-slate-200 bg-white p-6">
          <MemoSection opportunityId={opportunity.id} />
        </div>
      )}
    </div>
  );
}
