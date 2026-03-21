import { useEffect, useRef, useState, useMemo } from "react";
import { createSOSSocket } from "../services/api";
import MapView from "../components/MapView";
import toast   from "react-hot-toast";

export default function MapPage() {
  const [signals,  setSignals]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [filter,   setFilter]   = useState("all");
  const [wsStatus, setWsStatus] = useState("offline");
  const wsRef = useRef(null);

  useEffect(() => {
    wsRef.current = createSOSSocket({
      onConnect:    () => setWsStatus("connected"),
      onDisconnect: () => setWsStatus("reconnecting"),
      onSnapshot:   (data) => { setSignals(data); setLoading(false); },
      onNewSOS:     (s) => {
        setSignals(prev => prev.some(p => p.id === s.id) ? prev : [s, ...prev]);
        toast.error(`🆘 New SOS on map: ${s.name}`, { duration: 4000 });
      },
      onResolve: (id) => setSignals(prev =>
        prev.map(s => s.id === id ? { ...s, status: "RESOLVED" } : s)
      ),
    });
    return () => wsRef.current?.close();
  }, []);

  const displayed = useMemo(() => {
    if (filter === "active")   return signals.filter(s => s.status === "ACTIVE");
    if (filter === "resolved") return signals.filter(s => s.status !== "ACTIVE");
    return signals;
  }, [signals, filter]);

  const active  = signals.filter(s => s.status === "ACTIVE");
  const wsColor = { connected: "text-green-500", reconnecting: "text-yellow-500", offline: "text-red-400" }[wsStatus];
  const wsLabel = { connected: "● Live", reconnecting: "⟳ Reconnecting", offline: "✕ Offline" }[wsStatus];

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">🗺️ Live Map</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            {active.length} active · {signals.length} total signals
          </p>
        </div>
        <span className={`text-xs font-medium ${wsColor}`}>{wsLabel}</span>
      </div>

      {/* Filters + Legend */}
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        {["all", "active", "resolved"].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition capitalize ${
              filter === f
                ? "bg-blue-500 text-white"
                : "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300"
            }`}>
            {f === "all"      ? `All (${signals.length})`
            : f === "active"  ? `Active (${active.length})`
            :                   `Resolved (${signals.length - active.length})`}
          </button>
        ))}
        <div className="ml-auto flex gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-red-500 inline-block"/> Active SOS
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-gray-400 inline-block"/> Resolved
          </span>
        </div>
      </div>

      {/* Map — only passes signals, no socket inside */}
      <div className="rounded-xl overflow-hidden shadow mb-6">
        <MapView signals={displayed} />
      </div>

      {loading && (
        <p className="text-sm text-gray-400 text-center">Connecting to live feed...</p>
      )}

      {/* Active SOS list */}
      {!loading && active.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Active SOS Signals</h3>
          {active.map(s => (
            <div key={s.id}
              className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 flex justify-between items-center shadow-sm">
              <div>
                <p className="font-semibold text-gray-800 dark:text-gray-100 text-sm">{s.name}</p>
                <p className="text-xs text-gray-500">📍 {s.location} · 👥 {s.people_count} people</p>
                {s.message && <p className="text-xs text-gray-400 mt-1">💬 {s.message}</p>}
              </div>
              <div className="flex gap-2 items-center">
                <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-1 rounded-full">ACTIVE</span>
                <a href={`https://maps.google.com/?q=${s.latitude},${s.longitude}`}
                  target="_blank" rel="noreferrer"
                  className="bg-blue-500 hover:bg-blue-600 text-white text-xs px-3 py-1.5 rounded-lg transition">
                  Open Maps
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && active.length === 0 && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 text-green-700 dark:text-green-400 p-4 rounded-xl text-sm text-center">
          ✅ No active SOS signals right now.
        </div>
      )}
    </div>
  );
}