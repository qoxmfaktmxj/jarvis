"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { saveCustomerContacts } from "@/app/(app)/sales/customer-contacts/actions";
import type { z } from "zod";
import type { contactDetailSchema } from "@jarvis/shared/validation/sales/customer-detail";

type Contact = z.infer<typeof contactDetailSchema>;

interface FieldProps {
  label: string;
  value: string;
  readOnly?: boolean;
  onChange?: (v: string) => void;
}

function Field({ label, value, readOnly, onChange }: FieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <input
        className={[
          "rounded border px-3 py-2 text-sm outline-none",
          readOnly
            ? "cursor-not-allowed bg-gray-100 text-gray-500"
            : "border-gray-300 bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500",
        ].join(" ")}
        value={value ?? ""}
        readOnly={readOnly}
        onChange={(e) => onChange?.(e.target.value)}
      />
    </div>
  );
}

interface ContactEditFormProps {
  contact: Contact;
}

export function ContactEditForm({ contact }: ContactEditFormProps) {
  const t = useTranslations("Sales.CustomerContacts.Edit");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [draft, setDraft] = useState({
    custName: contact.custName ?? "",
    orgNm: contact.orgNm ?? "",
    jikweeNm: contact.jikweeNm ?? "",
    hpNo: contact.hpNo ?? "",
    telNo: contact.telNo ?? "",
    email: contact.email ?? "",
    statusYn: contact.statusYn ?? false,
    switComp: contact.switComp ?? "",
  });

  function patch<K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function handleSave() {
    startTransition(async () => {
      await saveCustomerContacts({
        creates: [],
        updates: [{ id: contact.id, patch: draft }],
        deletes: [],
      });
      router.push("/sales/customer-contacts");
    });
  }

  function handleDelete() {
    if (!confirm(t("confirmDelete"))) return;
    startTransition(async () => {
      await saveCustomerContacts({
        creates: [],
        updates: [],
        deletes: [contact.id],
      });
      router.push("/sales/customer-contacts");
    });
  }

  function handleBack() {
    router.push("/sales/customer-contacts");
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label={t("fields.custName")}
          value={draft.custName}
          onChange={(v) => patch("custName", v)}
        />
        <Field
          label={t("fields.custNm")}
          value={contact.custNm ?? ""}
          readOnly
        />
        <Field
          label={t("fields.orgNm")}
          value={draft.orgNm}
          onChange={(v) => patch("orgNm", v)}
        />
        <Field
          label={t("fields.jikweeNm")}
          value={draft.jikweeNm}
          onChange={(v) => patch("jikweeNm", v)}
        />
        <Field
          label={t("fields.hpNo")}
          value={draft.hpNo}
          onChange={(v) => patch("hpNo", v)}
        />
        <Field
          label={t("fields.telNo")}
          value={draft.telNo}
          onChange={(v) => patch("telNo", v)}
        />
        <Field
          label={t("fields.email")}
          value={draft.email}
          onChange={(v) => patch("email", v)}
        />
        <Field
          label={t("fields.switComp")}
          value={draft.switComp}
          onChange={(v) => patch("switComp", v)}
        />
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">
            {t("fields.statusYn")}
          </label>
          <input
            type="checkbox"
            checked={draft.statusYn}
            onChange={(e) => patch("statusYn", e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          disabled={isPending}
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
