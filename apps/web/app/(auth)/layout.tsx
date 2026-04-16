export default function AuthLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-50 px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="flex justify-center">
          <div
            className="text-display flex items-baseline gap-0.5 text-4xl font-bold leading-none tracking-tight text-isu-900"
            aria-label="ISU"
          >
            <span>IS</span>
            <span>U</span>
            <span
              aria-hidden="true"
              className="ml-0.5 inline-block h-2 w-2 translate-y-[-2px] rounded-full bg-lime-500"
            />
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
