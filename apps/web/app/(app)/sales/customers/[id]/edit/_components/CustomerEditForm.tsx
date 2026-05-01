"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { saveCustomers } from "@/app/(app)/sales/customers/actions";
import type { z } from "zod";
import type { customerDetailSchema } from "@jarvis/shared/validation/sales/customer-detail";

type Customer = z.infer<typeof customerDetailSchema>;

interface FieldProps {
  label: string;
  value: string;
  readOnly?: boolean;
  required?: boolean;
  onChange?: (v: string) => void;
}

function Field({ label, value, readOnly, required, onChange }: FieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-gray-700">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </label>
      <input
        className={[
          "rounded border px-3 py-2 text-sm outline-none",
          readOnly
            ? "cursor-not-allowed bg-gray-100 text-gray-500"
            : "border-gray-300 bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500",
        ].join(" ")}
        value={value ?? ""}
        readOnly={readOnly}
        required={required}
        onChange={(e) => onChange?.(e.target.value)}
      />
    </div>
  );
}

interface CustomerEditFormProps {
  customer: Customer;
}

export function CustomerEditForm({ customer }: CustomerEditFormProps) {
  const t = useTranslations("Sales.Customers.Edit");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [draft, setDraft] = useState({
    custNm: customer.custNm ?? "",
    ceoNm: customer.ceoNm ?? "",
    telNo: customer.telNo ?? "",
    businessNo: customer.businessNo ?? "",
    homepage: customer.homepage ?? "",
    addr1: customer.addr1 ?? "",
    addr2: customer.addr2 ?? "",
  });

  function patch<K extends keyof typeof draft>(key: K, value: string) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function handleSave() {
    startTransition(async () => {
      await saveCustomers({
        creates: [],
        updates: [{ id: customer.id, patch: draft }],
        deletes: [],
      });
      router.push("/sales/customers");
    });
  }

  function handleDelete() {
    if (!confirm(t("confirmDelete"))) return;
    startTransition(async () => {
      await saveCustomers({
        creates: [],
        updates: [],
        deletes: [customer.id],
      });
      router.push("/sales/customers");
    });
  }

  function handleBack() {
    router.push("/sales/customers");
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label={t("fields.custCd")}
          value={customer.custCd}
          readOnly
        />
        <Field
          label={t("fields.custNm")}
          value={draft.custNm}
          required
          onChange={(v) => patch("custNm", v)}
        />
        <Field
          label={t("fields.ceoNm")}
          value={draft.ceoNm}
          onChange={(v) => patch("ceoNm", v)}
        />
        <Field
          label={t("fields.telNo")}
          value={draft.telNo}
          onChange={(v) => patch("telNo", v)}
        />
        <Field
          label={t("fields.businessNo")}
          value={draft.businessNo}
          onChange={(v) => patch("businessNo", v)}
        />
        <Field
          label={t("fields.homepage")}
          value={draft.homepage}
          onChange={(v) => patch("homepage", v)}
        />
        <Field
          label={t("fields.addr1")}
          value={draft.addr1}
          onChange={(v) => patch("addr1", v)}
        />
        <Field
          label={t("fields.addr2")}
          value={draft.addr2}
          onChange={(v) => patch("addr2", v)}
        />
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          disabled={isPending || !draft.custNm.trim()}
          onClick={handleSave}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("save")}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={handleDelete}
          className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("delete")}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={handleBack}
          className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {t("back")}
        </button>
      </div>
    </div>
  );
}
