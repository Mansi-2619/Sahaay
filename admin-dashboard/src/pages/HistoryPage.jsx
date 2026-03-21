import { useEffect, useState } from "react";
import { getAllSOS }            from "../services/api";
import toast                   from "react-hot-toast";

function exportCSV(signals) {
  const headers = [
    "ID", "Name", "Location",
    "Latitude", "Longitude",
    "People", "Message", "Status", "Time"
  ];
  const rows = signals.map((s) => [
    s.id, s.name, s.location,
    s.latitude, s.longitude,
    s.people_count, s.message,
    s.status, s.timestamp
  ]);

  const csv = [headers, ...rows]
    .map((r) => r.join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `sahaay_sos_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast.success("CSV exported ✅");
}

export default function HistoryPage() {
  const [signals, setSignals] = useState([]);
  const [filter,  setFilter]  = useState("ALL");

  useEffect(() => {
    getAllSOS().then((r) => setSignals(r.data.signals));
  }, []);

  const filtered = filter === "ALL"
    ? signals
    : signals.filter((s) => s.status === filter);

  const active   = signals.filter((s) => s.status === "ACTIVE").length;
  const resolved = signals.filter((s) => s.status === "RESOLVED").length;

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">
            📋 History
          </h2>
          <p className="text-gray-500 text-sm">
            All SOS signals from this session
          </p>
        </div>
        <button
          onClick={() => exportCSV(signals)}
          disabled={signals.length === 0}
          className="bg-green-500 hover:bg-green-600
                     disabled:bg-gray-300 text-white text-sm
                     px-4 py-2 rounded-lg transition"
        >
          ⬇️ Export CSV
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label:"Total",    val:signals.length, color:"blue"  },
          { label:"Active",   val:active,         color:"red"   },
          { label:"Resolved", val:resolved,       color:"green" },
        ].map((c) => (
          <div key={c.label}
            className={`bg-white border border-gray-200
                        rounded-xl p-4 text-center shadow-sm`}>
            <p className={`text-3xl font-bold text-${c.color}-600`}>
              {c.val}
            </p>
            <p className="text-sm text-gray-500 mt-1">{c.label}</p>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4">
        {["ALL", "ACTIVE", "RESOLVED"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium
                        transition
              ${filter === f
                ? "bg-blue-500 text-white"
                : "bg-white border border-gray-200 text-gray-600"}`}
          >
            {f} ({f === "ALL" ? signals.length
                  : f === "ACTIVE" ? active : resolved})
          </button>
        ))}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-2">📭</p>
          <p>No SOS signals yet</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200
                        shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {["ID","Name","Location","People",
                  "Status","Message","Time"].map((h) => (
                  <th key={h}
                    className="text-left px-4 py-3 text-gray-600
                               font-medium text-xs uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50 transition">
                  <td className="px-4 py-3 text-gray-500 font-mono">
                    #{s.id}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-800">
                    {s.name}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {s.location}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {s.people_count}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold
                      ${s.status === "ACTIVE"
                        ? "bg-red-100 text-red-700"
                        : "bg-green-100 text-green-700"}`}>
                      {s.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 max-w-xs truncate">
                    {s.message || "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {s.timestamp}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}