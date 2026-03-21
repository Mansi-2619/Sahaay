/**
 * SOSFeed.jsx  –  Sahaay SOS Feed v3.1
 * DELETE your existing file and replace with this entire file.
 */

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import toast from "react-hot-toast";
import { resolveSOS, createSOSSocket } from "../services/api";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const RESCUE_BASE = [30.9010, 75.8573];
const TEAMS = [
  { id: "alpha",   name: "Team Alpha",   color: "#3b82f6", emoji: "🔵" },
  { id: "bravo",   name: "Team Bravo",   color: "#22c55e", emoji: "🟢" },
  { id: "charlie", name: "Team Charlie", color: "#f59e0b", emoji: "🟡" },
  { id: "delta",   name: "Team Delta",   color: "#ef4444", emoji: "🔴" },
];

function getPriority(s) {
  if (s.people_count >= 20) return { label: "CRITICAL", cls: "bg-red-600" };
  if (s.people_count >= 10) return { label: "HIGH",     cls: "bg-orange-500" };
  if (s.people_count >= 5)  return { label: "MEDIUM",   cls: "bg-yellow-500" };
  return                           { label: "LOW",       cls: "bg-gray-400" };
}

function playAlert() {
  try {
    const ctx  = new (window.AudioContext || window.webkitAudioContext)();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.start(); osc.stop(ctx.currentTime + 0.5);
  } catch (_) {}
}

const rescueIcon = new L.DivIcon({
  html: `<div style="font-size:24px">🚑</div>`, className: "", iconAnchor: [12, 12],
});

function makeVictimIcon(color, num) {
  return new L.DivIcon({
    html: `<div style="background:${color};color:white;font-size:11px;font-weight:bold;
      width:22px;height:22px;border-radius:50%;display:flex;align-items:center;
      justify-content:center;border:2px solid white">${num}</div>`,
    className: "", iconAnchor: [11, 11],
  });
}

function optimizeStops(start, stops) {
  const rem = [...stops], ordered = [];
  let cur = start;
  while (rem.length) {
    let ni = 0, nd = Infinity;
    rem.forEach((s, i) => {
      const d = Math.hypot(s.latitude - cur[0], s.longitude - cur[1]);
      if (d < nd) { nd = d; ni = i; }
    });
    ordered.push(rem[ni]);
    cur = [rem[ni].latitude, rem[ni].longitude];
    rem.splice(ni, 1);
  }
  return ordered;
}

async function fetchRoute(waypoints) {
  const coords = waypoints.map(([lat, lng]) => `${lng},${lat}`).join(";");
  const res  = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`);
  const data = await res.json();
  if (data.code !== "Ok") throw new Error("Routing failed");
  const r = data.routes[0];
  return {
    coords:   r.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
    distance: (r.distance / 1000).toFixed(2),
    duration: Math.round(r.duration / 60),
    legs:     r.legs.map(l => ({ distance: (l.distance/1000).toFixed(2), duration: Math.round(l.duration/60) })),
  };
}

function distribute(signals, teams) {
  const opt = optimizeStops(RESCUE_BASE, signals);
  const out = {}; teams.forEach(t => out[t.id] = []);
  opt.forEach((s, i) => out[teams[i % teams.length].id].push(s));
  return out;
}

// ── Skeleton ──────────────────────────────────────────────
function Skeleton() {
  return (
    <div className="bg-white dark:bg-gray-800 border-l-4 border-gray-200 rounded-xl p-4 shadow-sm animate-pulse">
      <div className="flex justify-between mb-3">
        <div className="flex gap-2">
          <div className="h-5 w-20 bg-gray-200 dark:bg-gray-700 rounded-full" />
          <div className="h-5 w-32 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>
        <div className="h-4 w-16 bg-gray-200 dark:bg-gray-700 rounded" />
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        {[...Array(4)].map((_, i) => <div key={i} className="h-4 bg-gray-200 dark:bg-gray-700 rounded" />)}
      </div>
      <div className="flex gap-2">
        {[...Array(3)].map((_, i) => <div key={i} className="h-8 w-20 bg-gray-200 dark:bg-gray-700 rounded-lg" />)}
      </div>
    </div>
  );
}

// ── WS Status Badge ───────────────────────────────────────
function WSBadge({ status }) {
  const map = {
    connected:    ["● Live",         "text-green-500"],
    reconnecting: ["⟳ Reconnecting", "text-yellow-500"],
    offline:      ["✕ Offline",      "text-red-500"],
  };
  const [label, cls] = map[status] || map.offline;
  return <span className={`text-xs font-medium ${cls}`}>{label}</span>;
}

// ── RescueRouteModal ──────────────────────────────────────
function RescueRouteModal({ signals, onClose }) {
  const emptyAssign = () => { const a = {}; TEAMS.forEach(t => a[t.id] = []); return a; };
  const [assign,   setAssign]   = useState(emptyAssign);
  const [routes,   setRoutes]   = useState({});
  const [loading,  setLoading]  = useState(false);
  const [tab,      setTab]      = useState("auto");
  const [dragging, setDragging] = useState(null);

  const active     = signals.filter(s => s.status === "ACTIVE");
  const hasRoutes  = Object.keys(routes).length > 0;
  const unassigned = active.filter(s => !TEAMS.some(t => assign[t.id].find(a => a.id === s.id)));
  const clearAll   = () => { setAssign(emptyAssign()); setRoutes({}); };

  const calcRoutes = async (assignment) => {
    const out = {};
    await Promise.all(TEAMS.map(async (team) => {
      const stops = assignment[team.id];
      if (!stops.length) return;
      out[team.id] = await fetchRoute([RESCUE_BASE, ...stops.map(s => [s.latitude, s.longitude])]);
    }));
    setRoutes(out);
  };

  const planAuto = async () => {
    if (!active.length) return toast.error("No active SOS signals");
    setLoading(true);
    try {
      const a = distribute(active, TEAMS);
      setAssign(a);
      await calcRoutes(a);
      toast.success("✅ Routes calculated!");
    } catch { toast.error("Failed to calculate routes."); }
    finally  { setLoading(false); }
  };

  const planManual = async () => {
    if (!TEAMS.some(t => assign[t.id].length)) return toast.error("Assign at least one SOS first");
    setLoading(true);
    try {
      const updated = { ...assign };
      TEAMS.forEach(t => { if (updated[t.id].length) updated[t.id] = optimizeStops(RESCUE_BASE, updated[t.id]); });
      setAssign(updated);
      await calcRoutes(updated);
      toast.success("✅ Routes calculated!");
    } catch { toast.error("Failed to calculate routes."); }
    finally  { setLoading(false); }
  };

  const handleDrop = (teamId) => {
    if (!dragging) return;
    setAssign(prev => {
      const next = { ...prev };
      TEAMS.forEach(t => { next[t.id] = next[t.id].filter(s => s.id !== dragging.id); });
      next[teamId] = [...next[teamId], dragging];
      return next;
    });
    setDragging(null);
    setRoutes({});
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] overflow-y-auto">
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">🗺️ Multi-Team Rescue Planner</h2>
            <p className="text-xs text-gray-500">{active.length} active SOS · {TEAMS.length} teams</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">×</button>
        </div>

        <div className="p-6 space-y-5">
          <div className="flex gap-2 border-b pb-3">
            {[["auto","⚡ Auto"],["manual","✋ Manual"]].map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                  tab === id ? "bg-blue-600 text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"
                }`}>
                {label}
              </button>
            ))}
          </div>

          {tab === "auto" && (
            <div className="space-y-3">
              <p className="text-sm text-gray-500">Distributes signals evenly using nearest-neighbour optimisation.</p>
              <div className="flex gap-3">
                <button onClick={planAuto} disabled={loading}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm px-5 py-2.5 rounded-lg font-medium">
                  {loading ? "⏳ Calculating..." : "🚀 Auto Plan"}
                </button>
                <button onClick={clearAll}
                  className="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm px-4 py-2.5 rounded-lg">
                  🔄 Clear
                </button>
              </div>
            </div>
          )}

          {tab === "manual" && (
            <div className="space-y-4">
              <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 border border-dashed border-gray-300 dark:border-gray-600">
                <p className="text-xs font-semibold text-gray-500 mb-2">🆘 Unassigned ({unassigned.length})</p>
                <div className="flex flex-wrap gap-2">
                  {unassigned.length === 0
                    ? <p className="text-xs text-gray-400">All assigned</p>
                    : unassigned.map(s => (
                      <div key={s.id} draggable onDragStart={() => setDragging(s)}
                        className="bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-1.5 rounded-lg cursor-grab select-none">
                        🆘 {s.name || `#${s.id}`}
                      </div>
                    ))
                  }
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {TEAMS.map(t => (
                  <div key={t.id}
                    onDragOver={e => e.preventDefault()}
                    onDrop={() => handleDrop(t.id)}
                    className="rounded-xl p-3 border-2 border-dashed min-h-20"
                    style={{ borderColor: t.color + "60", backgroundColor: t.color + "10" }}>
                    <p className="text-xs font-bold mb-2" style={{ color: t.color }}>
                      {t.emoji} {t.name} ({assign[t.id].length})
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {assign[t.id].length === 0
                        ? <p className="text-xs text-gray-400">Drop here</p>
                        : assign[t.id].map(s => (
                          <div key={s.id} draggable onDragStart={() => setDragging(s)}
                            className="text-xs px-2 py-1 rounded-lg text-white cursor-grab select-none"
                            style={{ backgroundColor: t.color }}>
                            {s.name || `#${s.id}`}
                          </div>
                        ))
                      }
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-3">
                <button onClick={planManual} disabled={loading}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm px-5 py-2.5 rounded-lg font-medium">
                  {loading ? "⏳ Calculating..." : "📍 Calculate Routes"}
                </button>
                <button onClick={clearAll}
                  className="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm px-4 py-2.5 rounded-lg">
                  🔄 Clear
                </button>
              </div>
            </div>
          )}

          {hasRoutes && (
            <div className="grid grid-cols-2 gap-3">
              {TEAMS.map(t => {
                const r = routes[t.id], stops = assign[t.id];
                if (!r) return (
                  <div key={t.id} className="rounded-xl border border-gray-200 p-3 opacity-40">
                    <p className="text-sm font-bold" style={{ color: t.color }}>{t.emoji} {t.name}</p>
                    <p className="text-xs text-gray-400 mt-1">No victims assigned</p>
                  </div>
                );
                return (
                  <div key={t.id} className="rounded-xl border-2 p-3" style={{ borderColor: t.color + "60" }}>
                    <div className="flex justify-between items-center mb-2">
                      <p className="text-sm font-bold" style={{ color: t.color }}>{t.emoji} {t.name}</p>
                      <div className="flex gap-2 text-xs">
                        <span className="bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">{r.distance} km</span>
                        <span className="bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">{r.duration} min</span>
                      </div>
                    </div>
                    {stops.map((s, i) => (
                      <div key={s.id} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                        <span className="text-white font-bold w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: t.color }}>{i + 1}</span>
                        <span className="truncate">{s.name || `SOS #${s.id}`}</span>
                        <span className="ml-auto">{r.legs[i]?.duration}m</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}

          <div className="rounded-xl overflow-hidden border border-gray-200">
            <MapContainer center={RESCUE_BASE} zoom={12} style={{ height: "420px", width: "100%" }}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
              <Marker position={RESCUE_BASE} icon={rescueIcon}>
                <Popup><strong>🚑 Rescue Base</strong></Popup>
              </Marker>
              {TEAMS.map(t => routes[t.id]?.coords?.length > 1 && (
                <Polyline key={t.id} positions={routes[t.id].coords}
                  pathOptions={{ color: t.color, weight: 5, opacity: 0.85, dashArray: "8 4" }} />
              ))}
              {TEAMS.map(t => assign[t.id].map((s, i) => (
                <div key={s.id}>
                  <Circle center={[s.latitude, s.longitude]} radius={250}
                    pathOptions={{ color: t.color, fillColor: t.color, fillOpacity: 0.15 }} />
                  <Marker position={[s.latitude, s.longitude]} icon={makeVictimIcon(t.color, i + 1)}>
                    <Popup>
                      <p className="font-bold" style={{ color: t.color }}>{t.emoji} {t.name} · Stop #{i + 1}</p>
                      <p className="font-bold text-red-600">🆘 {s.name}</p>
                      <p>📍 {s.location}</p>
                      <p>👥 {s.people_count}</p>
                    </Popup>
                  </Marker>
                </div>
              )))}
              {unassigned.map(s => (
                <Marker key={s.id} position={[s.latitude, s.longitude]}>
                  <Popup><p className="font-bold text-gray-500">⬜ Unassigned: {s.name}</p></Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>

          {hasRoutes && (
            <div className="flex flex-wrap gap-3">
              {TEAMS.map(t => (
                <div key={t.id} className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                  <div className="w-6 h-2 rounded-full" style={{ backgroundColor: t.color }} />
                  {t.name} ({assign[t.id].length} stops)
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── SOSCard ───────────────────────────────────────────────
function SOSCard({ s, onResolve, isNew }) {
  const [assigning, setAssigning] = useState(false);
  const [assigned,  setAssigned]  = useState(s.assigned_team || null);
  const [resolving, setResolving] = useState(false);
  const priority = getPriority(s);

  const handleResolve = async () => {
    setResolving(true);
    onResolve(s.id);
    try {
      await resolveSOS(s.id);
      toast.success("SOS resolved ✅");
    } catch {
      toast.error("Failed to resolve — please retry");
    } finally {
      setResolving(false);
    }
  };

  return (
    <div className={`bg-white dark:bg-gray-800 border-l-4 border-red-500 rounded-xl p-4 shadow-sm ${isNew ? "ring-2 ring-red-400" : ""}`}>
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="bg-red-100 dark:bg-red-900/30 text-red-700 text-xs font-bold px-2 py-1 rounded-full">
            #{s.id} ACTIVE
          </span>
          <span className={`text-white text-xs font-bold px-2 py-1 rounded-full ${priority.cls}`}>
            {priority.label}
          </span>
          {isNew && (
            <span className="bg-yellow-400 text-yellow-900 text-xs font-bold px-2 py-1 rounded-full animate-bounce">
              NEW
            </span>
          )}
          <span className="font-semibold text-gray-800 dark:text-gray-100">{s.name || "Unknown"}</span>
        </div>
        <span className="text-xs text-gray-400">{s.timestamp}</span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm text-gray-600 dark:text-gray-400 mb-3">
        <p>📍 {s.location || "N/A"}</p>
        <p>👥 {s.people_count || 0} people</p>
        <p>🌐 {s.latitude?.toFixed(4)}, {s.longitude?.toFixed(4)}</p>
        {s.message && <p className="col-span-2">💬 {s.message}</p>}
      </div>

      {s.media?.length > 0 && (
        <div className="flex gap-2 flex-wrap mb-3">
          {s.media.map((url, i) =>
            /\.(mp4|mov|webm)$/i.test(url)
              ? <video key={i} src={`http://localhost:8000${url}`} controls className="w-40 h-28 rounded-lg object-cover" />
              : <img key={i} src={`http://localhost:8000${url}`} alt=""
                  onClick={() => window.open(`http://localhost:8000${url}`)}
                  className="w-40 h-28 rounded-lg object-cover cursor-pointer" />
          )}
        </div>
      )}

      {assigned ? (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 rounded-lg px-3 py-2 text-sm text-blue-700 mb-3">
          🚑 Assigned to: <strong>{assigned}</strong>
        </div>
      ) : assigning ? (
        <div className="grid grid-cols-2 gap-2 mb-3">
          {TEAMS.map(t => (
            <button key={t.id} style={{ backgroundColor: t.color }}
              onClick={() => { setAssigned(t.name); setAssigning(false); toast.success(`${t.name} assigned ✅`); }}
              className="text-white text-xs px-3 py-2 rounded-lg font-medium">
              {t.emoji} {t.name}
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex gap-2 flex-wrap">
        <button onClick={handleResolve} disabled={resolving}
          className="bg-green-500 hover:bg-green-600 disabled:opacity-60 text-white text-sm px-4 py-1.5 rounded-lg">
          {resolving ? "..." : "✅ Resolve"}
        </button>
        <button onClick={() => setAssigning(v => !v)}
          className="bg-blue-500 hover:bg-blue-600 text-white text-sm px-4 py-1.5 rounded-lg">
          🚑 Assign Team
        </button>
        <a href={`https://maps.google.com/?q=${s.latitude},${s.longitude}`} target="_blank" rel="noopener noreferrer"
          className="bg-gray-500 hover:bg-gray-600 text-white text-sm px-4 py-1.5 rounded-lg">
          🗺️ Maps
        </a>
      </div>
    </div>
  );
}

// ── SOSFeed (main export) ─────────────────────────────────
export default function SOSFeed({ onRefresh, onActiveCountChange, onWsStatusChange, onSignalsChange }) {  const [signals,     setSignals]  = useState([]);
  const [newIds,      setNewIds]   = useState(new Set());
  const [search,      setSearch]   = useState("");
  const [sortBy,      setSortBy]   = useState("time");
  const [showPlanner, setPlanner]  = useState(false);
  const [loading,     setLoading]  = useState(true);
  const [wsStatus,    setWsStatus] = useState("offline");
  const wsRef = useRef(null);

  // Report active count up to Dashboard header
  useEffect(() => {
    const count = signals.filter(s => s.status === "ACTIVE").length;
    onActiveCountChange?.(count);
    onSignalsChange?.(signals.filter(s => s.status === "ACTIVE"));
  }, [signals]); // eslint-disable-line react-hooks/exhaustive-deps
  // Report WS status up to Dashboard header
  useEffect(() => {
    onWsStatusChange?.(wsStatus);
  }, [wsStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  // Single WS connection — mounts once, no prop interference
  useEffect(() => {
    wsRef.current = createSOSSocket({
      onConnect:    () => setWsStatus("connected"),
      onDisconnect: () => setWsStatus("reconnecting"),
      onSnapshot: (data) => {
        setSignals(data);
        setLoading(false);
      },
      onNewSOS: (signal) => {
        setSignals(prev => {
          if (prev.some(s => s.id === signal.id)) return prev;
          return [signal, ...prev];
        });
        setNewIds(prev => new Set(prev).add(signal.id));
        setTimeout(() => setNewIds(prev => {
          const n = new Set(prev); n.delete(signal.id); return n;
        }), 10_000);
        playAlert();
        toast.error(`🆘 New SOS: ${signal.name} — ${signal.location}`, { duration: 6000 });
        onRefresh?.();
      },
      onResolve: (id) => {
        setSignals(prev => prev.filter(s => s.id !== id));
        onRefresh?.();
      },
    });
    return () => wsRef.current?.close();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleResolve = useCallback((id) => {
    setSignals(prev => prev.filter(s => s.id !== id));
  }, []);

  const active = useMemo(() => signals.filter(s => s.status === "ACTIVE"), [signals]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    let list = active.filter(s =>
      (s.name    || "").toLowerCase().includes(q) ||
      (s.location|| "").toLowerCase().includes(q) ||
      (s.message || "").toLowerCase().includes(q)
    );
    if (sortBy === "priority") {
      const ord = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
      list = [...list].sort((a, b) => ord[getPriority(a).label] - ord[getPriority(b).label]);
    }
    return list;
  }, [active, search, sortBy]);

  return (
    <div>
      <div className="flex gap-3 mb-4 flex-wrap">
        <input
          type="text"
          placeholder="🔍 Search..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-48 border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value)}
          className="border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500"
        >
          <option value="time">Newest first</option>
          <option value="priority">By priority</option>
        </select>
        <button
          onClick={() => setPlanner(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2.5 rounded-xl font-medium whitespace-nowrap"
        >
          🗺️ Plan Rescue
        </button>
      </div>

      <div className="flex justify-between mb-3">
        <p className="text-xs text-gray-400">{filtered.length} of {active.length} active</p>
        <WSBadge status={wsStatus} />
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} />)}
        </div>
      ) : active.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-4xl mb-2">✅</p>
          <p className="text-gray-500">No active SOS signals</p>
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-center text-gray-400 py-8">No results found</p>
      ) : (
        <div className="space-y-3">
          {filtered.map(s => (
            <SOSCard key={s.id} s={s} isNew={newIds.has(s.id)} onResolve={handleResolve} />
          ))}
        </div>
      )}

      {showPlanner && <RescueRouteModal signals={signals} onClose={() => setPlanner(false)} />}
    </div>
  );
}