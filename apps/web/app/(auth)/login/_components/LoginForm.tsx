"use client";

import { type FormEvent, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

type AuthResponse = {
  ok: boolean;
  redirectTo?: string;
  error?: string;
};

export function LoginForm({ returnTo }: { returnTo: string }) {
  const t = useTranslations("Auth.Login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState<"login" | "demo" | null>(null);
  const [error, setError] = useState(false);

  async function finish(response: Response | null): Promise<void> {
    const payload = response ? ((await response.json().catch(() => null)) as AuthResponse | null) : null;
    if (!response?.ok || !payload?.ok || !payload.redirectTo) {
      setPending(null);
      setError(true);
      return;
    }
    window.location.replace(payload.redirectTo);
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setPending("login");
    setError(false);
    await finish(
      await fetch(`/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      }).catch(() => null),
    );
  }

  async function startDemo(): Promise<void> {
    setPending("demo");
    setError(false);
    await finish(
      await fetch(`/api/auth/demo?returnTo=${encodeURIComponent(returnTo)}`, {
        method: "POST",
      }).catch(() => null),
    );
  }

  return (
    <section className="w-full max-w-md rounded-xl border border-[var(--border-default)] bg-[var(--bg-page)] p-6 shadow-[var(--shadow-soft)]">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="mt-2 text-sm text-[var(--fg-secondary)]">{t("description")}</p>
      <form className="mt-6 space-y-4" onSubmit={(event) => void submit(event)}>
        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium">
            {t("email")}
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="h-10 w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-page)] px-3 outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
          />
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-medium">
            {t("password")}
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-10 w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-page)] px-3 outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
          />
        </div>
        {error ? (
          <p role="alert" className="text-sm text-red-700">
            {t("invalidCredentials")}
          </p>
        ) : null}
        <Button className="w-full" type="submit" disabled={pending !== null}>
          {pending === "login" ? t("signingIn") : t("signIn")}
        </Button>
      </form>
      <div className="my-5 flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-[var(--border-default)]" />
        <span className="text-xs text-[var(--fg-muted)]">{t("or")}</span>
        <span className="h-px flex-1 bg-[var(--border-default)]" />
      </div>
      <Button className="w-full" variant="secondary" disabled={pending !== null} onClick={() => void startDemo()}>
        {pending === "demo" ? t("startingDemo") : t("startDemo")}
      </Button>
      <p className="mt-3 text-xs text-[var(--fg-muted)]">{t("demoDescription")}</p>
    </section>
  );
}
