const colors = {
  LOW:    { bg: "bg-green-500",  text: "All conditions normal" },
  MEDIUM: { bg: "bg-orange-500", text: "Moderate risk detected" },
  HIGH:   { bg: "bg-red-600",    text: "DANGER — Take action now" },
};

export default function RiskBanner({ risk, reasons }) {
  const level  = risk || "LOW";
  const config = colors[level];

  return (
    <div className={`${config.bg} text-white rounded-xl p-4 mb-6`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium opacity-90">Current Risk Level</p>
          <p className="text-3xl font-bold">{level}</p>
        </div>
        <div className="text-right text-sm opacity-90">
          {reasons?.map((r, i) => <p key={i}>• {r}</p>)}
        </div>
      </div>
    </div>
  );
}