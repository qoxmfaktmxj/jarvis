import { isAllowedRoutePath } from "@jarvis/shared/constants/routes";
import { LoginForm } from "./_components/LoginForm";

export default async function LoginPage(props: {
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const raw = (await props.searchParams).returnTo;
  const candidate = Array.isArray(raw) ? raw[0] : raw;
  const returnTo = isAllowedRoutePath(candidate) ? candidate : "/dashboard";
  return <LoginForm returnTo={returnTo} />;
}
