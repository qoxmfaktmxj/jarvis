export default async function LoginPage({
  searchParams
}: {
  searchParams?: Promise<{ redirect?: string }>;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const redirectTo = resolvedSearchParams.redirect ?? "/dashboard";

  return (
    <div className="rounded-lg bg-white p-8 shadow-md">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-gray-900">Jarvis</h1>
        <p className="mt-1 text-gray-500">사내 포털에 로그인하세요</p>
      </div>
      <a
        href={`/api/auth/login?redirect=${encodeURIComponent(redirectTo)}`}
        className="block w-full rounded-lg bg-blue-600 px-4 py-3 text-center font-medium text-white transition-colors hover:bg-blue-700"
      >
        SSO로 로그인
      </a>
    </div>
  );
}
