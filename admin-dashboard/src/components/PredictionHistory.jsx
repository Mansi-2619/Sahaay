import { useEffect, useState } from "react";

const RISK_BADGE = {
  HIGH:   "bg-red-100 text-red-700",
  MEDIUM: "bg-yellow-100 text-yellow-700",
  LOW:    "bg-green-100 text-green-700",
};

export default function PredictionHistory() {
  const [history, setHistory] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("prediction_history") || "[]");
    } catch { return []; }
  });

  useEffect(() => {
    const handler = () => {
      try {
        setHistory(JSON.parse(localStorage.getItem("prediction_history") || "[]"));
      } catch {}
    };
    window.addEventListener("prediction_logged", handler);
    return () => window.removeEventListener("prediction_logged", handler);
  }, []);

  const clearHistory = () => {
    localStorage.removeItem("prediction_history");
    setHistory([]);
  };

  if (!history.length) return (
    <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
      No prediction history yet. Run a prediction to start logging.
    </div>
  );

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="flex justify-between items-center px-5 py-4 border-b border-gray-100">
        <h3 className="font-bold text-gray-800">📋 Prediction History</h3>
        <button onClick={clearHistory} className="text-xs text-red-400 hover:text-red-600">
          🗑 Clear
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
            <tr>
              <th className="px-4 py-3 text-left">Time</th>
              <th className="px-4 py-3 text-left">Overall</th>
              <th className="px-4 py-3 text-left">🌊 Flood</th>
              <th className="px-4 py-3 text-left">🌍 Earthquake</th>
              <th className="px-4 py-3 text-left">🔥 Heatwave</th>
              <th className="px-4 py-3 text-left">💨 Air Quality</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {history.slice().reverse().map((entry, i) => (
              <tr key={i} className="hover:bg-gray-50 transition">
                <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{entry.time}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-bold px-2 py-1 rounded-full ${RISK_BADGE[entry.overall] || ""}`}>
                    {entry.overall}
                  </span>
                </td>
                {["flood", "earthquake", "heatwave", "air_quality"].map(type => (
                  <td key={type} className="px-4 py-3">
                    <div className="flex flex-col">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full w-fit ${RISK_BADGE[entry.predictions?.[type]?.risk_level] || ""}`}>
                        {entry.predictions?.[type]?.risk_level || "—"}
                      </span>
                      <span className="text-xs text-gray-400 mt-0.5">
                        {entry.predictions?.[type]?.probability}%
                      </span>
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}