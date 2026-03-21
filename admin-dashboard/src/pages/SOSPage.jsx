import { useState } from "react";
import { resolveSOS } from "../services/api";
import toast from "react-hot-toast";
import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const RESCUE_BASE = [30.9010, 75.8573]; // ← change to your actual base

const TEAMS = [
  { id: "alpha",   name: "Team Alpha",   color: "#3b82f6", emoji: "🔵" },
  { id: "bravo",   name: "Team Bravo",   color: "#22c55e", emoji: "🟢" },
  { id: "charlie", name: "Team Charlie", color: "#f59e0b", emoji: "🟡" },
  { id: "delta",   name: "Team Delta",   color: "#ef4444", emoji: "🔴" },
];

const rescueIcon = new L.DivIcon({
  html: `<div style="font-size:24px">🚑</div>`,
  className: "",
  iconAnchor: [12, 12],
});

function makeVictimIcon(color, stopNum) {
  return new L.DivIcon({
    html: `<div style="background:${color};color:white;font-size:11px;font-weight:bold;
                width:22px;height:22px;border-radius:50%;display:flex;align-items:center;
                justify-content:center;border:2px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.3)">
             ${stopNum}
           </div>`,
    className: "",
    iconAnchor: [11, 11],
  });
}

function optimizeStops(start, stops) {
  if (stops.length === 0) return [];
  const remaining = [...stops];
  const ordered   = [];
  let current     = start;
  while (remaining.length > 0) {
    let nearestIdx  = 0;
    let nearestDist = Infinity;
    remaining.forEach((stop, idx) => {
      const d = Math.hypot(stop.latitude - current[0], stop.longitude - current[1]);
      if (d < nearestDist) { nearestDist = d; nearestIdx = idx; }
    });
    ordered.push(remaining[nearestIdx]);
    current = [remaining[nearestIdx].latitude, remaining[nearestIdx].longitude];
    remaining.splice(nearestIdx, 1);
  }
  return ordered;
}

async function fetchRoute(waypoints) {
  const coords = waypoints.map(([lat, lng]) => `${lng},${lat}`).join(";");
  const url    = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;
  const res    = await fetch(url);
  const data   = await res.json();
  if (data.code !== "Ok") throw new Error("Routing failed");
  const route    = data.routes[0];
  const coords2d = route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
  const distance = (route.distance / 1000).toFixed(2);
  const duration = Math.round(route.duration / 60);
  const legs     = route.legs.map(leg => ({
    distance: (leg.distance / 1000).toFixed(2),
    duration: Math.round(leg.duration / 60),
  }));
  return { coords: coords2d, distance, duration, legs };
}

// Distribute SOS signals across teams as evenly as possible
function distributeSignals(signals, teams) {
  const optimized = optimizeStops(RESCUE_BASE, signals);
  const assigned  = {};
  teams.forEach(t => assigned[t.id] = []);
  optimized.forEach((s, idx) => {
    assigned[teams[idx % teams.length].id].push(s);
  });
  return assigned;
}

function RescueRouteModal({ signals, onClose }) {
  // teamAssignments: { alpha: [sos,...], bravo: [...], ... }
  const [teamAssignments, setTeamAssignments] = useState(() => {
    const a = {};
    TEAMS.forEach(t => a[t.id] = []);
    return a;
  });
  // teamRoutes: { alpha: { coords, distance, duration, legs }, ... }
  const [teamRoutes,   setTeamRoutes]   = useState({});
  const [loading,      setLoading]      = useState(false);
  const [activeTab,    setActiveTab]    = useState("auto"); // "auto" | "manual"
  const [draggingSOS,  setDraggingSOS]  = useState(null);

  const active = signals.filter(s => s.status === "ACTIVE");

  // ── AUTO: distribute evenly then fetch all routes ──
  const planAuto = async () => {
    if (active.length === 0) return toast.error("No active SOS signals");
    setLoading(true);
    try {
      const assigned = distributeSignals(active, TEAMS);
      setTeamAssignments(assigned);
      const routes = {};
      await Promise.all(
        TEAMS.map(async (team) => {
          const stops = assigned[team.id];
          if (stops.length === 0) return;
          const waypoints = [RESCUE_BASE, ...stops.map(s => [s.latitude, s.longitude])];
          routes[team.id] = await fetchRoute(waypoints);
        })
      );
      setTeamRoutes(routes);
      toast.success("✅ All team routes calculated!");
    } catch {
      toast.error("Failed to calculate routes. Check internet.");
    } finally {
      setLoading(false);
    }
  };

  // ── MANUAL: drag SOS cards into team buckets ──
  const handleDrop = (teamId) => {
    if (!draggingSOS) return;
    setTeamAssignments(prev => {
      const next = { ...prev };
      // remove from all teams first
      TEAMS.forEach(t => { next[t.id] = next[t.id].filter(s => s.id !== draggingSOS.id); });
      next[teamId] = [...next[teamId], draggingSOS];
      return next;
    });
    setDraggingSOS(null);
    setTeamRoutes({}); // clear old routes
  };

  const planManual = async () => {
    const hasAny = TEAMS.some(t => teamAssignments[t.id].length > 0);
    if (!hasAny) return toast.error("Assign at least one SOS to a team first");
    setLoading(true);
    try {
      const routes = {};
      await Promise.all(
        TEAMS.map(async (team) => {
          const stops = teamAssignments[team.id];
          if (stops.length === 0) return;
          const ordered   = optimizeStops(RESCUE_BASE, stops);
          const waypoints = [RESCUE_BASE, ...ordered.map(s => [s.latitude, s.longitude])];
          routes[team.id] = await fetchRoute(waypoints);
          // update order
          setTeamAssignments(prev => ({ ...prev, [team.id]: ordered }));
        })
      );
      setTeamRoutes(routes);
      toast.success("✅ Manual team routes calculated!");
    } catch {
      toast.error("Failed to calculate routes.");
    } finally {
      setLoading(false);
    }
  };

  const clearAll = () => {
    const a = {};
    TEAMS.forEach(t => a[t.id] = []);
    setTeamAssignments(a);
    setTeamRoutes({});
  };

  // unassigned signals (for manual drag)
  const unassigned = active.filter(s =>
    !TEAMS.some(t => teamAssignments[t.id].find(a => a.id === s.id))
  );

  const hasRoutes = Object.keys(teamRoutes).length > 0;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] overflow-y-auto">

        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">🗺️ Multi-Team Rescue Planner</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">{active.length} active SOS · {TEAMS.length} teams available</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <div className="p-6 space-y-5">

          {/* Mode tabs */}
          <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700 pb-3">
            <button onClick={() => setActiveTab("auto")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${activeTab === "auto" ? "bg-blue-600 text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"}`}>
              ⚡ Auto Distribute
            </button>
            <button onClick={() => setActiveTab("manual")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${activeTab === "manual" ? "bg-blue-600 text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"}`}>
              ✋ Manual Assign
            </button>
          </div>

          {/* AUTO mode */}
          {activeTab === "auto" && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Automatically distributes SOS signals evenly across all 4 teams using nearest-neighbor optimization, then calculates each team's fastest road route.
              </p>
              <div className="flex gap-3">
                <button onClick={planAuto} disabled={loading}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm px-5 py-2.5 rounded-lg font-medium transition">
                  {loading ? "⏳ Calculating all routes..." : "🚀 Auto Plan All Teams"}
                </button>
                <button onClick={clearAll}
                  className="bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 text-gray-700 dark:text-gray-300 text-sm px-4 py-2.5 rounded-lg transition">
                  🔄 Clear
                </button>
              </div>
            </div>
          )}

          {/* MANUAL mode */}
          {activeTab === "manual" && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Drag SOS victims into team buckets, then click Calculate Routes.
              </p>

              {/* Unassigned pool */}
              <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 border border-dashed border-gray-300 dark:border-gray-600">
                <p className="text-xs font-semibold text-gray-500 mb-2">🆘 Unassigned ({unassigned.length})</p>
                <div className="flex flex-wrap gap-2">
                  {unassigned.length === 0
                    ? <p className="text-xs text-gray-400">All signals assigned</p>
                    : unassigned.map(s => (
                      <div key={s.id} draggable
                        onDragStart={() => setDraggingSOS(s)}
                        className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-400 text-xs px-3 py-1.5 rounded-lg cursor-grab select-none">
                        🆘 {s.name || `#${s.id}`}
                      </div>
                    ))
                  }
                </div>
              </div>

              {/* Team drop zones */}
              <div className="grid grid-cols-2 gap-3">
                {TEAMS.map(team => (
                  <div key={team.id}
                    onDragOver={e => e.preventDefault()}
                    onDrop={() => handleDrop(team.id)}
                    className="rounded-xl p-3 border-2 border-dashed transition"
                    style={{ borderColor: team.color + "60", backgroundColor: team.color + "10" }}>
                    <p className="text-xs font-bold mb-2" style={{ color: team.color }}>
                      {team.emoji} {team.name} ({teamAssignments[team.id].length})
                    </p>
                    <div className="flex flex-wrap gap-1 min-h-8">
                      {teamAssignments[team.id].length === 0
                        ? <p className="text-xs text-gray-400">Drop victims here</p>
                        : teamAssignments[team.id].map(s => (
                          <div key={s.id}
                            draggable
                            onDragStart={() => setDraggingSOS(s)}
                            className="text-xs px-2 py-1 rounded-lg text-white cursor-grab select-none"
                            style={{ backgroundColor: team.color }}>
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
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm px-5 py-2.5 rounded-lg font-medium transition">
                  {loading ? "⏳ Calculating..." : "📍 Calculate Routes"}
                </button>
                <button onClick={clearAll}
                  className="bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 text-gray-700 dark:text-gray-300 text-sm px-4 py-2.5 rounded-lg transition">
                  🔄 Clear All
                </button>
              </div>
            </div>
          )}

          {/* Team route stats */}
          {hasRoutes && (
            <div className="grid grid-cols-2 gap-3">
              {TEAMS.map(team => {
                const route = teamRoutes[team.id];
                const stops = teamAssignments[team.id];
                if (!route) return (
                  <div key={team.id} className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 opacity-40">
                    <p className="text-sm font-bold" style={{ color: team.color }}>{team.emoji} {team.name}</p>
                    <p className="text-xs text-gray-400 mt-1">No victims assigned</p>
                  </div>
                );
                return (
                  <div key={team.id} className="rounded-xl border-2 p-3" style={{ borderColor: team.color + "60" }}>
                    <div className="flex justify-between items-center mb-2">
                      <p className="text-sm font-bold" style={{ color: team.color }}>{team.emoji} {team.name}</p>
                      <div className="flex gap-2 text-xs">
                        <span className="bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded font-medium">{route.distance} km</span>
                        <span className="bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded font-medium">{route.duration} min</span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      {stops.map((s, idx) => (
                        <div key={s.id} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                          <span className="text-white text-xs font-bold w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: team.color }}>
                            {idx + 1}
                          </span>
                          <span className="truncate">{s.name || `SOS #${s.id}`}</span>
                          <span className="ml-auto text-gray-400 flex-shrink-0">
                            {route.legs[idx]?.duration}m
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Map with all team routes */}
          <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">
            <MapContainer center={RESCUE_BASE} zoom={12} style={{ height: "420px", width: "100%" }}>
              <TileLayer
                attribution='&copy; OpenStreetMap contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              {/* Rescue base */}
              <Marker position={RESCUE_BASE} icon={rescueIcon}>
                <Popup><strong>🚑 Rescue Base</strong></Popup>
              </Marker>

              {/* Each team's route polyline */}
              {TEAMS.map(team => {
                const route = teamRoutes[team.id];
                if (!route || route.coords.length < 2) return null;
                return (
                  <Polyline key={team.id}
                    positions={route.coords}
                    pathOptions={{ color: team.color, weight: 5, opacity: 0.85, dashArray: "8 4" }}
                  />
                );
              })}

              {/* Each team's victim markers */}
              {TEAMS.map(team =>
                teamAssignments[team.id].map((s, idx) => (
                  <div key={s.id}>
                    <Circle
                      center={[s.latitude, s.longitude]}
                      radius={250}
                      pathOptions={{ color: team.color, fillColor: team.color, fillOpacity: 0.15 }}
                    />
                    <Marker
                      position={[s.latitude, s.longitude]}
                      icon={makeVictimIcon(team.color, idx + 1)}
                    >
                      <Popup>
                        <div className="text-sm space-y-1">
                          <p className="font-bold" style={{ color: team.color }}>
                            {team.emoji} {team.name} · Stop #{idx + 1}
                          </p>
                          <p className="font-bold text-red-600">🆘 {s.name}</p>
                          <p>📍 {s.location}</p>
                          <p>👥 {s.people_count} people</p>
                          {s.message && <p>💬 {s.message}</p>}
                          {teamRoutes[team.id]?.legs[idx] && (
                            <p className="text-xs" style={{ color: team.color }}>
                              {teamRoutes[team.id].legs[idx].distance} km · {teamRoutes[team.id].legs[idx].duration} min from prev
                            </p>
                          )}
                        </div>
                      </Popup>
                    </Marker>
                  </div>
                ))
              )}

              {/* Unassigned signals (gray) */}
              {unassigned.map(s => (
                <Marker key={s.id} position={[s.latitude, s.longitude]}>
                  <Popup>
                    <p className="text-sm font-bold text-gray-500">⬜ Unassigned</p>
                    <p className="text-sm">🆘 {s.name}</p>
                    <p className="text-xs">📍 {s.location}</p>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>

          {/* Map legend */}
          {hasRoutes && (
            <div className="flex flex-wrap gap-3">
              {TEAMS.map(team => (
                <div key={team.id} className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                  <div className="w-6 h-2 rounded-full" style={{ backgroundColor: team.color }} />
                  {team.name} ({teamAssignments[team.id].length} stops)
                </div>
              ))}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

function SOSCard({ s, onRefresh }) {
  const [assigning, setAssigning] = useState(false);
  const [assigned,  setAssigned]  = useState(s.assigned_team || null);

  const handleResolve = async () => {
    try {
      await resolveSOS(s.id);
      toast.success("SOS marked as resolved ✅");
      onRefresh();
    } catch {
      toast.error("Failed to resolve");
    }
  };

  const handleAssign = (team) => {
    setAssigned(team.name);
    setAssigning(false);
    toast.success(`${team.name} assigned to SOS #${s.id} ✅`);
  };

  return (
    <div className="bg-white dark:bg-gray-800 border-l-4 border-red-500 rounded-xl p-4 shadow-sm">
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-2">
          <span className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-xs font-bold px-2 py-1 rounded-full">
            #{s.id} ACTIVE
          </span>
          <span className="font-semibold text-gray-800 dark:text-gray-100">{s.name || "Unknown"}</span>
        </div>
        <span className="text-xs text-gray-400">{s.timestamp}</span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm text-gray-600 dark:text-gray-400 mb-3">
        <p>📍 {s.location || "N/A"}</p>
        <p>👥 {s.people_count || 0} people</p>
        <p>🌐 {s.latitude}, {s.longitude}</p>
        {s.message && <p className="col-span-2">💬 {s.message}</p>}
      </div>

      {s.media && s.media.length > 0 && (
        <div className="flex gap-2 flex-wrap mb-3">
          {s.media.map((url, i) => {
            const isVideo = url.match(/\.(mp4|mov|webm|avi)$/i);
            return isVideo ? (
              <video key={i} src={`http://localhost:8000${url}`} controls
                className="w-40 h-28 rounded-lg object-cover border border-gray-200" />
            ) : (
              <img key={i} src={`http://localhost:8000${url}`} alt="SOS media"
                className="w-40 h-28 rounded-lg object-cover border border-gray-200 cursor-pointer"
                onClick={() => window.open(`http://localhost:8000${url}`)} />
            );
          })}
        </div>
      )}

      {assigned ? (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg px-3 py-2 text-sm text-blue-700 dark:text-blue-400 mb-3">
          🚑 Assigned to: <strong>{assigned}</strong>
        </div>
      ) : assigning ? (
        <div className="grid grid-cols-2 gap-2 mb-3">
          {TEAMS.map((t) => (
            <button key={t.id} onClick={() => handleAssign(t)}
              className="text-white text-xs px-3 py-2 rounded-lg transition font-medium"
              style={{ backgroundColor: t.color }}>
              {t.emoji} {t.name}
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex gap-2 flex-wrap">
        <button onClick={handleResolve}
          className="bg-green-500 hover:bg-green-600 text-white text-sm px-4 py-1.5 rounded-lg transition">
          ✅ Resolve
        </button>
        <button onClick={() => setAssigning(!assigning)}
          className="bg-blue-500 hover:bg-blue-600 text-white text-sm px-4 py-1.5 rounded-lg transition">
          🚑 Assign Team
        </button>
        <a href={`https://maps.google.com/?q=${s.latitude},${s.longitude}`}
          className="bg-gray-500 hover:bg-gray-600 text-white text-sm px-4 py-1.5 rounded-lg transition">
          🗺️ Open Maps
        </a>
      </div>
    </div>
  );
}

export default function SOSFeed({ signals = [], onRefresh }) {
  const [search,      setSearch]      = useState("");
  const [showPlanner, setShowPlanner] = useState(false);

  const active   = Array.isArray(signals) ? signals.filter((s) => s.status === "ACTIVE") : [];
  const filtered = active.filter((s) =>
    (s.name     || "").toLowerCase().includes(search.toLowerCase()) ||
    (s.location || "").toLowerCase().includes(search.toLowerCase()) ||
    (s.message  || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="flex gap-3 mb-4">
        <input
          type="text"
          placeholder="🔍 Search by name, location or message..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button onClick={() => setShowPlanner(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2.5 rounded-xl font-medium transition whitespace-nowrap">
          🗺️ Plan Rescue Route
        </button>
      </div>

      <p className="text-xs text-gray-400 mb-3">
        Showing {filtered.length} of {active.length} active signals
      </p>

      {active.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-8 text-center">
          <p className="text-4xl mb-2">✅</p>
          <p className="text-gray-500">No active SOS signals</p>
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-center text-gray-400 py-8">No results found</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((s) => (
            <SOSCard key={s.id} s={s} onRefresh={onRefresh} />
          ))}
        </div>
      )}

      {showPlanner && (
        <RescueRouteModal signals={signals} onClose={() => setShowPlanner(false)} />
      )}
    </div>
  );
}