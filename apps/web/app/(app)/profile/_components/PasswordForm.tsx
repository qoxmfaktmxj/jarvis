"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { changePasswordAction, type PasswordActionState } from "../actions";

const initialState: PasswordActionState = { status: "idle" };

export function PasswordForm() {
  const t = useTranslations("Profile.Password");
  const [state, action, pending] = useActionState(changePasswordAction, initialState);
  const errorMessage =
    state.errorCode === "INVALID_CURRENT_PASSWORD"
      ? t("errors.invalidCurrentPassword")
      : state.errorCode === "DEMO_READ_ONLY"
        ? t("errors.demoReadOnly")
        : state.errorCode === "INVALID_INPUT"
          ? t("errors.invalidInput")
          : null;

  return (
    <form action={action} className="space-y-4 rounded-lg border border-[var(--border-default)] p-5">
      <h2 className="font-medium">{t("title")}</h2>
      <div>
        <label htmlFor="currentPassword" className="mb-1 block text-sm font-medium">
          {t("currentPassword")}
        </label>
        <input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          className="h-10 w-full rounded-md border border-[var(--border-default)] px-3 outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
        />
      </div>
      <div>
        <label htmlFor="newPassword" className="mb-1 block text-sm font-medium">
          {t("newPassword")}
        </label>
        <input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          className="h-10 w-full rounded-md border border-[var(--border-default)] px-3 outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
        />
        <p className="mt-1 text-xs text-[var(--fg-muted)]">{t("policy")}</p>
      </div>
      {state.status === "success" ? (
        <p role="status" className="text-sm text-green-700">
          {t("success")}
        </p>
      ) : null}
      {errorMessage ? (
        <p role="alert" className="text-sm text-red-700">
          {errorMessage}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? t("saving") : t("save")}
      </Button>
    </form>
  );
}
