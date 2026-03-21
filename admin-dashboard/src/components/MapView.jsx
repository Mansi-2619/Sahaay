import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import toast from "react-hot-toast";

const TILE_LAYERS = {
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "&copy; Esri",
    label: "🛰️ Satellite",
  },
  street: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "&copy; OpenStreetMap contributors",
    label: "🗺️ Street",
  },
};

const RESCUE_BASE = { lat: 30.9010, lng: 75.8573, name: "SAHAAY HQ" };

const TEAMS = [
  { id: "alpha",   name: "Team Alpha",   color: "#3b82f6", emoji: "🔵", status: "available",  lat: 30.920, lng: 75.840 },
  { id: "bravo",   name: "Team Bravo",   color: "#22c55e", emoji: "🟢", status: "available",  lat: 30.885, lng: 75.870 },
  { id: "charlie", name: "Team Charlie", color: "#f59e0b", emoji: "🟡", status: "on-mission", lat: 30.910, lng: 75.890 },
  { id: "delta",   name: "Team Delta",   color: "#ef4444", emoji: "🔴", status: "available",  lat: 30.895, lng: 75.830 },
];

const STATUS_COLORS = {
  available:    { bg: "bg-green-100",  text: "text-green-700",  dot: "#22c55e", label: "Available"  },
  "on-mission": { bg: "bg-yellow-100", text: "text-yellow-700", dot: "#f59e0b", label: "On Mission"  },
  returning:    { bg: "bg-blue-100",   text: "text-blue-700",   dot: "#3b82f6", label: "Returning"   },
};

function makeTeamIcon(team) {
  return L.divIcon({
    html: `
      <div style="position:relative">
        <div style="
          width:36px;height:36px;background:${team.color};
          border-radius:50%;border:3px solid white;
          box-shadow:0 2px 8px rgba(0,0,0,0.4);
          display:flex;align-items:center;justify-content:center;
          font-size:16px;
        ">${team.emoji}</div>
        <div style="
          position:absolute;bottom:-4px;left:50%;transform:translateX(-50%);
          background:white;border-radius:4px;padding:1px 4px;
          font-size:9px;font-weight:bold;color:${team.color};
          white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,0.2);
        ">${team.name}</div>
      </div>`,
    className: "",
    iconAnchor: [18, 18],
    popupAnchor: [0, -20],
  });
}

function makeBaseIcon() {
  return L.divIcon({
    html: `
      <div style="
        width:44px;height:44px;background:#1e40af;
        border-radius:8px;border:3px solid white;
        box-shadow:0 2px 10px rgba(0,0,0,0.5);
        display:flex;align-items:center;justify-content:center;
        font-size:22px;
      ">🏥</div>`,
    className: "",
    iconAnchor: [22, 22],
    popupAnchor: [0, -25],
  });
}

function makeSOSIcon(priority) {
  const color = priority === "CRITICAL" ? "#dc2626"
    : priority === "HIGH"     ? "#ea580c"
    : priority === "MEDIUM"   ? "#d97706" : "#6b7280";
  return L.divIcon({
    html: `
      <div style="
        width:32px;height:32px;background:${color};
        border-radius:50%;border:3px solid white;
        box-shadow:0 0 0 3px ${color}44,0 2px 8px rgba(0,0,0,0.4);
        display:flex;align-items:center;justify-content:center;
        font-size:15px;animation:pulse 1.5s infinite;
      ">🆘</div>`,
    className: "",
    iconAnchor: [16, 16],
    popupAnchor: [0, -20],
  });
}

function getPriority(s) {
  if (s.people_count >= 20) return "CRITICAL";
  if (s.people_count >= 10) return "HIGH";
  if (s.people_count >= 5)  return "MEDIUM";
  return "LOW";
}

export default function MapView({ signals = [] }) {
  const containerRef   = useRef(null);
  const mapRef         = useRef(null);
  const markersRef     = useRef([]);
  const teamMarkersRef = useRef({});
  const baseMarkerRef  = useRef(null);
  const myLocRef       = useRef(null);
  const watchIdRef     = useRef(null);
  const tileRef        = useRef(null);
  const linesRef       = useRef([]);

  const [mapType,      setMapType]      = useState("satellite");
  const [teams,        setTeams]        = useState(TEAMS);
  const [selectedSOS,  setSelectedSOS]  = useState(null);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [showPanel,    setShowPanel]    = useState(true);

  const active = signals.filter(s => s.status === "ACTIVE");

  // ── KEY FIX: invalidateSize every time this tab is shown ─
  useEffect(() => {
    // Wait for DOM to fully paint the container, then tell
    // Leaflet to recalculate its dimensions.
    const timer = setTimeout(() => {
      if (mapRef.current) {
        mapRef.current.invalidateSize();
      }
    }, 300);
    return () => clearTimeout(timer);
  }, []); // runs only on mount

  // ── Init map (runs once) ─────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    mapRef.current = L.map(containerRef.current, {
      center: [RESCUE_BASE.lat, RESCUE_BASE.lng],
      zoom: 13,
      zoomControl: true,
    });

    tileRef.current = L.tileLayer(TILE_LAYERS.satellite.url, {
      attribution: TILE_LAYERS.satellite.attribution,
      maxZoom: 19,
    }).addTo(mapRef.current);

    // Rescue base marker
    baseMarkerRef.current = L.marker([RESCUE_BASE.lat, RESCUE_BASE.lng], {
      icon: makeBaseIcon(), zIndexOffset: 1000,
    })
      .addTo(mapRef.current)
      .bindPopup(`
        <div style="font-size:13px;min-width:140px">
          <p style="font-weight:bold;color:#1e40af;margin-bottom:4px">🏥 ${RESCUE_BASE.name}</p>
          <p style="color:#6b7280">Main rescue coordination center</p>
          <p style="color:#6b7280">Lat: ${RESCUE_BASE.lat} · Lng: ${RESCUE_BASE.lng}</p>
        </div>
      `);

    // GPS tracking
    if (navigator.geolocation) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          if (myLocRef.current) {
            myLocRef.current.marker.remove();
            myLocRef.current.circle.remove();
          }
          const marker = L.marker([latitude, longitude], {
            icon: L.divIcon({
              html: `<div style="width:16px;height:16px;background:#3b82f6;border-radius:50%;border:3px solid white;box-shadow:0 0 0 4px rgba(59,130,246,0.35)"></div>`,
              className: "", iconAnchor: [8, 8],
            }),
          }).addTo(mapRef.current).bindPopup("<strong>📍 Your Location</strong>");

          const circle = L.circle([latitude, longitude], {
            radius: 100, color: "#3b82f6", fillColor: "#3b82f6",
            fillOpacity: 0.15, weight: 1,
          }).addTo(mapRef.current);

          myLocRef.current = { marker, circle, lat: latitude, lng: longitude };
        },
        (err) => console.warn("Location:", err.message),
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
      );
    }

    return () => {
      if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  }, []); // runs once on mount

  // ── Tile layer switch ────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !tileRef.current) return;
    tileRef.current.remove();
    tileRef.current = L.tileLayer(TILE_LAYERS[mapType].url, {
      attribution: TILE_LAYERS[mapType].attribution, maxZoom: 19,
    }).addTo(mapRef.current);
  }, [mapType]);

  // ── Team markers ─────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current) return;
    Object.values(teamMarkersRef.current).forEach(m => m.remove());
    teamMarkersRef.current = {};

    teams.forEach(team => {
      const m = L.marker([team.lat, team.lng], {
        icon: makeTeamIcon(team), zIndexOffset: 500,
      })
        .addTo(mapRef.current)
        .bindPopup(`
          <div style="font-size:13px;min-width:160px">
            <p style="font-weight:bold;color:${team.color};margin-bottom:4px">${team.emoji} ${team.name}</p>
            <p style="margin-bottom:2px">Status: <strong>${STATUS_COLORS[team.status]?.label || team.status}</strong></p>
            <p style="color:#6b7280;font-size:11px">Lat: ${team.lat.toFixed(4)} · Lng: ${team.lng.toFixed(4)}</p>
            ${team.assignedTo ? `<p style="color:#f59e0b;margin-top:4px">🆘 Assigned to: ${team.assignedTo}</p>` : ""}
          </div>
        `);

      m.on("click", () => setSelectedTeam(team.id));
      teamMarkersRef.current[team.id] = m;
    });
  }, [teams]);

  // ── SOS markers ─────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current) return;
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    active.forEach(s => {
      if (!s.latitude || !s.longitude) return;
      const priority = getPriority(s);

      const circle = L.circle([s.latitude, s.longitude], {
        radius: 300, color: "#ef4444", fillColor: "#ef4444",
        fillOpacity: 0.2, weight: 2,
      }).addTo(mapRef.current);

      const marker = L.marker([s.latitude, s.longitude], {
        icon: makeSOSIcon(priority),
      })
        .addTo(mapRef.current)
        .bindPopup(`
          <div style="font-size:13px;min-width:180px">
            <p style="font-weight:bold;color:#dc2626;margin-bottom:4px">🆘 ${s.name || "Unknown"}</p>
            <p>📍 ${s.location || "N/A"}</p>
            <p>👥 ${s.people_count || 0} people · <strong>${priority}</strong></p>
            ${s.message ? `<p>💬 ${s.message}</p>` : ""}
            <p style="color:#9ca3af;font-size:11px">${s.timestamp || ""}</p>
            <button onclick="window.selectSOS('${s.id}')"
              style="margin-top:6px;background:#3b82f6;color:white;border:none;
              padding:4px 10px;border-radius:6px;cursor:pointer;font-size:12px">
              🚑 Assign Team
            </button>
          </div>
        `);

      marker.on("click", () => setSelectedSOS(s.id));
      markersRef.current.push(circle, marker);
    });
  }, [signals]);

  // ── Assignment lines ─────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current) return;
    linesRef.current.forEach(l => l.remove());
    linesRef.current = [];

    teams.forEach(team => {
      if (!team.assignedTo) return;
      const sos = active.find(s => String(s.id) === String(team.assignedTo));
      if (!sos?.latitude) return;
      const line = L.polyline(
        [[team.lat, team.lng], [sos.latitude, sos.longitude]],
        { color: team.color, weight: 3, opacity: 0.8, dashArray: "8 5" }
      ).addTo(mapRef.current);
      linesRef.current.push(line);
    });
  }, [teams, signals]);

  // ── Assign team to SOS ───────────────────────────────────
  const assignTeam = useCallback((teamId, sosId) => {
    const sos  = active.find(s => String(s.id) === String(sosId));
    const team = teams.find(t => t.id === teamId);
    if (!sos || !team) return;

    setTeams(prev => prev.map(t =>
      t.id === teamId
        ? { ...t, status: "on-mission", assignedTo: sosId, assignedName: sos.name }
        : t
    ));

    setTimeout(() => {
      if (teamMarkersRef.current[teamId]) {
        teamMarkersRef.current[teamId].setIcon(makeTeamIcon({ ...team, status: "on-mission" }));
      }
    }, 100);

    toast.success(`✅ ${team.name} assigned to ${sos.name || `SOS #${sosId}`}!`);
    setSelectedSOS(null);
    setSelectedTeam(null);

    if (mapRef.current) {
      mapRef.current.fitBounds(
        [[team.lat, team.lng], [sos.latitude, sos.longitude]],
        { padding: [60, 60] }
      );
    }
  }, [teams, active]);

  const unassignTeam = useCallback((teamId) => {
    const team = teams.find(t => t.id === teamId);
    setTeams(prev => prev.map(t =>
      t.id === teamId
        ? { ...t, status: "available", assignedTo: null, assignedName: null }
        : t
    ));
    toast(`${team?.name} unassigned`, { icon: "↩️" });
  }, [teams]);

  const recenter = () => {
    if (mapRef.current) mapRef.current.setView([RESCUE_BASE.lat, RESCUE_BASE.lng], 13);
  };

  const selectedSOSData  = active.find(s => String(s.id) === String(selectedSOS));
  const selectedTeamData = teams.find(t => t.id === selectedTeam);

  return (
    <div className="flex gap-4">
      {/* ── Map ── */}
      <div className="flex-1 relative">
        <div
          ref={containerRef}
          style={{ height: "560px", width: "100%" }}
          className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 shadow-sm"
        />

        {/* Map type toggle */}
        <div className="absolute top-3 right-3 z-[1000] flex gap-1 bg-white dark:bg-gray-800 border border-gray-200 rounded-lg shadow-md p-1">
          {Object.entries(TILE_LAYERS).map(([key, val]) => (
            <button key={key} onClick={() => setMapType(key)}
              className={`text-xs px-2.5 py-1.5 rounded-md font-medium transition ${
                mapType === key ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-100"
              }`}>
              {val.label}
            </button>
          ))}
        </div>

        {/* Bottom controls */}
        <div className="absolute bottom-4 right-4 z-[1000] flex gap-2">
          <button onClick={() => setShowPanel(p => !p)}
            className="bg-white dark:bg-gray-800 border border-gray-200 shadow-md text-xs px-3 py-2 rounded-lg hover:bg-gray-50 transition">
            {showPanel ? "Hide Panel" : "Show Panel"}
          </button>
          <button onClick={recenter}
            className="bg-white dark:bg-gray-800 border border-gray-200 shadow-md text-sm px-3 py-2 rounded-lg hover:bg-blue-50 transition">
            📍 Recenter
          </button>
        </div>

        {/* Legend */}
        <div className="absolute bottom-4 left-4 z-[1000] bg-white dark:bg-gray-800 border border-gray-200 rounded-lg shadow-md px-3 py-2">
          <p className="text-xs font-bold text-gray-600 mb-1.5">Legend</p>
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs text-gray-500"><span>🏥</span> Rescue HQ</div>
            <div className="flex items-center gap-2 text-xs text-gray-500"><span>🆘</span> Active SOS</div>
            {teams.map(t => (
              <div key={t.id} className="flex items-center gap-2 text-xs text-gray-500">
                <span>{t.emoji}</span> {t.name}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Side Panel ── */}
      {showPanel && (
        <div className="w-72 flex-shrink-0 space-y-3 overflow-y-auto" style={{ maxHeight: "560px" }}>

          {/* Assignment modal */}
          {selectedSOSData && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border-2 border-blue-400 p-4 shadow-lg">
              <div className="flex justify-between items-start mb-3">
                <p className="font-bold text-gray-800 dark:text-gray-100 text-sm">🚑 Assign Team</p>
                <button onClick={() => setSelectedSOS(null)} className="text-gray-400 hover:text-gray-600">✕</button>
              </div>
              <div className="bg-red-50 rounded-lg p-2 mb-3">
                <p className="text-xs font-bold text-red-700">🆘 {selectedSOSData.name}</p>
                <p className="text-xs text-gray-500">📍 {selectedSOSData.location}</p>
                <p className="text-xs text-gray-500">👥 {selectedSOSData.people_count} people</p>
              </div>
              <p className="text-xs text-gray-500 mb-2">Select a team to assign:</p>
              <div className="space-y-2">
                {teams.map(team => (
                  <button key={team.id}
                    onClick={() => assignTeam(team.id, selectedSOSData.id)}
                    disabled={team.status === "on-mission"}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg border text-sm transition disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
                    style={{ borderColor: team.color + "60" }}>
                    <span style={{ color: team.color }} className="font-medium">
                      {team.emoji} {team.name}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[team.status]?.bg} ${STATUS_COLORS[team.status]?.text}`}>
                      {STATUS_COLORS[team.status]?.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Teams status */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
            <p className="font-bold text-gray-800 dark:text-gray-100 text-sm mb-3">🚑 Team Status</p>
            <div className="space-y-2">
              {teams.map(team => (
                <div key={team.id}
                  onClick={() => {
                    setSelectedTeam(team.id);
                    if (mapRef.current) mapRef.current.setView([team.lat, team.lng], 15);
                  }}
                  className={`rounded-lg border p-2.5 cursor-pointer transition hover:shadow-md ${
                    selectedTeam === team.id ? "ring-2" : ""
                  }`}
                  style={{ borderColor: team.color + "40" }}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-bold" style={{ color: team.color }}>
                      {team.emoji} {team.name}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[team.status]?.bg} ${STATUS_COLORS[team.status]?.text}`}>
                      {STATUS_COLORS[team.status]?.label}
                    </span>
                  </div>
                  {team.assignedTo ? (
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-xs text-gray-500">→ {team.assignedName || `SOS #${team.assignedTo}`}</p>
                      <button onClick={e => { e.stopPropagation(); unassignTeam(team.id); }}
                        className="text-xs text-red-400 hover:text-red-600">↩ Unassign</button>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 mt-1">No assignment</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Active SOS list */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
            <p className="font-bold text-gray-800 dark:text-gray-100 text-sm mb-3">
              🆘 Active SOS ({active.length})
            </p>
            {active.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-3">No active signals</p>
            ) : (
              <div className="space-y-2">
                {active.map(s => {
                  const priority    = getPriority(s);
                  const assignedTeam = teams.find(t => String(t.assignedTo) === String(s.id));
                  return (
                    <div key={s.id}
                      onClick={() => {
                        setSelectedSOS(s.id);
                        if (mapRef.current && s.latitude) mapRef.current.setView([s.latitude, s.longitude], 15);
                      }}
                      className={`rounded-lg border border-red-200 bg-red-50 p-2.5 cursor-pointer hover:shadow-md transition ${
                        selectedSOS === String(s.id) ? "ring-2 ring-red-400" : ""
                      }`}>
                      <div className="flex justify-between items-start">
                        <p className="text-xs font-bold text-red-700">🆘 {s.name || `#${s.id}`}</p>
                        <span className={`text-xs px-1.5 py-0.5 rounded text-white ${
                          priority === "CRITICAL" ? "bg-red-600" :
                          priority === "HIGH"     ? "bg-orange-500" :
                          priority === "MEDIUM"   ? "bg-yellow-500" : "bg-gray-400"
                        }`}>{priority}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">📍 {s.location || "N/A"}</p>
                      <p className="text-xs text-gray-500">👥 {s.people_count} people</p>
                      {assignedTeam ? (
                        <p className="text-xs mt-1 font-medium" style={{ color: assignedTeam.color }}>
                          {assignedTeam.emoji} {assignedTeam.name} assigned
                        </p>
                      ) : (
                        <p className="text-xs text-orange-500 mt-1">⚠ No team assigned</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
            <p className="font-bold text-gray-800 dark:text-gray-100 text-sm mb-3">📊 Quick Stats</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-green-50 rounded-lg p-2 text-center">
                <p className="text-lg font-bold text-green-600">
                  {teams.filter(t => t.status === "available").length}
                </p>
                <p className="text-xs text-gray-500">Available</p>
              </div>
              <div className="bg-yellow-50 rounded-lg p-2 text-center">
                <p className="text-lg font-bold text-yellow-600">
                  {teams.filter(t => t.status === "on-mission").length}
                </p>
                <p className="text-xs text-gray-500">On Mission</p>
              </div>
              <div className="bg-red-50 rounded-lg p-2 text-center">
                <p className="text-lg font-bold text-red-600">{active.length}</p>
                <p className="text-xs text-gray-500">Active SOS</p>
              </div>
              <div className="bg-orange-50 rounded-lg p-2 text-center">
                <p className="text-lg font-bold text-orange-600">
                  {active.filter(s => !teams.some(t => String(t.assignedTo) === String(s.id))).length}
                </p>
                <p className="text-xs text-gray-500">Unassigned</p>
              </div>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}