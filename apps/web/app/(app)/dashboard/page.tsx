const stats = [
  { label: "Projects", value: "0" },
  { label: "Knowledge Pages", value: "0" },
  { label: "Search Queries", value: "0" },
  { label: "Ask AI", value: "Ready" }
];

export default function DashboardPage() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Dashboard</h1>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((item) => (
          <div
            key={item.label}
            className="rounded-lg border border-gray-200 bg-white p-6"
          >
            <p className="text-sm text-gray-500">{item.label}</p>
            <p className="mt-1 text-3xl font-bold text-gray-900">{item.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
