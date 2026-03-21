export default function StatsPanel({ stats }) {
  const cards = [
    {
      label: "Active SOS",
      value: stats?.active_sos ?? 0,
      bg:    "bg-red-50",
      border:"border-red-200",
      text:  "text-red-600",
      icon:  "🆘",
    },
    {
      label: "Total SOS Today",
      value: stats?.total_sos ?? 0,
      bg:    "bg-orange-50",
      border:"border-orange-200",
      text:  "text-orange-600",
      icon:  "📋",
    },
    {
      label: "Temperature",
      value: stats?.weather?.temperature
        ? `${stats.weather.temperature}°C`
        : "--",
      bg:    "bg-blue-50",
      border:"border-blue-200",
      text:  "text-blue-600",
      icon:  "🌡️",
    },
    {
      label: "Weather",
      value: stats?.weather?.description ?? "--",
      bg:    "bg-green-50",
      border:"border-green-200",
      text:  "text-green-600",
      icon:  "🌤️",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      {cards.map((c) => (
        <div
          key={c.label}
          className={`${c.bg} ${c.border} border rounded-xl p-4`}
        >
          <p className="text-2xl mb-1">{c.icon}</p>
          <p className={`text-2xl font-bold ${c.text}`}>{c.value}</p>
          <p className="text-sm text-gray-500 mt-1">{c.label}</p>
        </div>
      ))}
    </div>
  );
}