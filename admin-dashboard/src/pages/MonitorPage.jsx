import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine,
} from "recharts";
import PredictionHistory from "../components/PredictionHistory";
import CityAlertSender   from "../components/CityAlertSender";

const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

const RISK_COLORS = {
  CRITICAL: { bg:"bg-red-950/40",    border:"border-red-500",    badge:"bg-red-900/60 text-red-300",       dot:"bg-red-500"    },
  HIGH:     { bg:"bg-orange-950/40", border:"border-orange-400", badge:"bg-orange-900/60 text-orange-300", dot:"bg-orange-500" },
  MEDIUM:   { bg:"bg-yellow-950/40", border:"border-yellow-400", badge:"bg-yellow-900/60 text-yellow-300", dot:"bg-yellow-400" },
  LOW:      { bg:"bg-green-950/40",  border:"border-green-500",  badge:"bg-green-900/60 text-green-300",   dot:"bg-green-500"  },
};

const DISASTER_ICONS  = { flood:"🌊", earthquake:"🌍", heatwave:"🔥", air_quality:"💨" };
const DISASTER_LABELS = { flood:"Flood", earthquake:"Earthquake", heatwave:"Heatwave", air_quality:"Air Quality" };
const RISK_ORDER      = { CRITICAL:0, HIGH:1, MEDIUM:2, LOW:3 };

// ── Risk Score Bar ────────────────────────────────────────
function RiskScoreBar({ score=0, level="LOW" }) {
  const color = {
    CRITICAL:"bg-red-500", HIGH:"bg-orange-500",
    MEDIUM:"bg-yellow-400", LOW:"bg-green-500",
  }[level] || "bg-green-500";
  return (
    <div className="mt-2">
      <div className="flex justify-between text-xs text-gray-400 mb-1">
        <span>Risk Score</span><span>{score}/100</span>
      </div>
      <div className="h-1.5 bg-gray-700 rounded-full">
        <div className={`h-1.5 rounded-full transition-all duration-700 ${color}`}
          style={{ width:`${Math.min(score,100)}%` }}/>
      </div>
    </div>
  );
}

// ── City Card ─────────────────────────────────────────────
function CityCard({ city, onSelect, selected }) {
  const cfg      = RISK_COLORS[city.risk_level] || RISK_COLORS.LOW;
  const isActive = selected === city.city;

  return (
    <div onClick={() => onSelect(isActive ? null : city.city)}
      className={`
        ${cfg.bg} border-l-4 ${cfg.border} rounded-xl p-4 shadow-md cursor-pointer
        transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5
        ${isActive ? "ring-2 ring-blue-400 ring-offset-2 ring-offset-gray-900" : ""}
      `}>
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${cfg.dot} animate-pulse`}/>
          <h3 className="font-bold text-white text-lg">{city.city}</h3>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${cfg.badge}`}>
            {city.risk_level}
          </span>
          {city.emoji && <span className="text-xl">{city.emoji}</span>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1.5 text-sm text-gray-300">
        <p>🌡️ {city.weather?.temperature ?? "—"}°C</p>
        <p>💧 {city.weather?.humidity    ?? "—"}%</p>
        <p>🌧️ {city.weather?.rainfall   ?? "—"} mm</p>
        <p>💨 {city.weather?.wind_speed  ?? "—"} km/h</p>
      </div>

      <RiskScoreBar score={city.risk_score ?? 0} level={city.risk_level}/>

      {city.reasons?.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {city.reasons.slice(0,2).map((r,i) => (
            <span key={i}
              className="text-xs bg-gray-800/60 border border-gray-600 text-gray-400 px-2 py-0.5 rounded-full">
              {r.length > 32 ? r.slice(0,32)+"…" : r}
            </span>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-500 mt-2">🕐 {city.timestamp}</p>
    </div>
  );
}

// ── City Prediction Panel ─────────────────────────────────
function CityPredictionPanel({ city }) {
  const [predictions, setPredictions] = useState(null);
  const [overall,     setOverall]     = useState(null);
  const [loading,     setLoading]     = useState(false);
  const [showForm,    setShowForm]    = useState(false);
  const [showAlert,   setShowAlert]   = useState(false);
  const [weather,     setWeather]     = useState(null);

  const [inputs, setInputs] = useState({
    temperature_c:30, humidity_pct:65, wind_speed_kmh:12,
    rainfall_mm:0, consecutive_rain_days:1, rainfall_7day_sum:0,
    humidity_7day_avg:65, seismic_activity:0.5, ground_vibration:0.2,
    historical_quakes_5yr:1, fault_distance_km:100, depth_km:30,
    foreshock_count:0, heat_index:32, consecutive_hot_days:0,
    temp_7day_avg:29, temp_max_7day:33, pm2_5:45, pm10:80,
    aqi:75, wind_7day_avg:11,
  });

  const runPrediction = useCallback(async (data={}) => {
    setLoading(true);
    setPredictions(null);
    try {
      const res = await axios.post(`${BASE}/predict/all`, data);
      setPredictions(res.data.predictions);
      setOverall(res.data.overall_highest_risk);
      // Save to history
      const hist = JSON.parse(localStorage.getItem("prediction_history") || "[]");
      hist.push({
        time: new Date().toLocaleString(),
        city,
        overall: res.data.overall_highest_risk,
        predictions: res.data.predictions,
      });
      if (hist.length > 100) hist.shift();
      localStorage.setItem("prediction_history", JSON.stringify(hist));
      window.dispatchEvent(new Event("prediction_logged"));
    } catch (e) {
      console.error("Prediction failed:", e);
    }
    setLoading(false);
  }, [city]);

  useEffect(() => {
    if (!city) return;
    setPredictions(null);
    setOverall(null);
    axios.get(`${BASE}/weather/${city}`)
      .then(res => {
        const w = res.data;
        setWeather(w);
        const auto = {
          temperature_c:w.temperature??30,         humidity_pct:w.humidity??65,
          wind_speed_kmh:w.wind_speed??12,          rainfall_mm:w.rainfall??0,
          consecutive_rain_days:1,                  rainfall_7day_sum:(w.rainfall??0)*5,
          humidity_7day_avg:w.humidity??65,          seismic_activity:0.5,
          ground_vibration:0.2,                     historical_quakes_5yr:1,
          fault_distance_km:100,                    depth_km:30,
          foreshock_count:0,                        heat_index:w.temperature??32,
          consecutive_hot_days:(w.temperature??0)>38?3:0,
          temp_7day_avg:w.temperature??29,          temp_max_7day:(w.temperature??30)+3,
          pm2_5:45, pm10:80, aqi:75,               wind_7day_avg:w.wind_speed??11,
        };
        setInputs(auto);
        runPrediction(auto);
      })
      .catch(() => runPrediction(inputs));
  }, [city]); // eslint-disable-line

  if (!city) return (
    <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-10 text-center text-gray-500 mb-6">
      <p className="text-3xl mb-2">👆</p>
      <p>Click a city card to see AI predictions and trends</p>
    </div>
  );

  const cfg = RISK_COLORS[overall] || RISK_COLORS.LOW;

  return (
    <div className="mb-6 space-y-4">
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-5 shadow-sm">
        {/* Header */}
        <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
          <div>
            <h3 className="font-bold text-white text-base">🤖 AI Predictions — {city}</h3>
            {weather && (
              <p className="text-xs text-gray-400 mt-0.5">
                {weather.temperature}°C · {weather.humidity}% humidity · {weather.rainfall}mm rain · {weather.wind_speed}km/h wind
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {overall && (
              <span className={`text-xs font-bold px-3 py-1 rounded-full ${cfg.badge}`}>
                Overall: {overall}
              </span>
            )}
            <button onClick={() => setShowForm(f => !f)}
              className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 px-3 py-1.5 rounded-lg transition">
              ⚙️ {showForm ? "Hide" : "Custom Input"}
            </button>
            <button onClick={() => runPrediction(inputs)} disabled={loading}
              className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg transition disabled:opacity-50">
              {loading ? "⏳ Running…" : "🔄 Re-run"}
            </button>
            <button onClick={() => setShowAlert(a => !a)}
              className="text-xs bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg transition">
              🚨 {showAlert ? "Hide" : "Send Alert"}
            </button>
          </div>
        </div>

        {/* Custom form */}
        {showForm && (
          <div className="bg-gray-900 rounded-lg p-4 mb-4 border border-gray-700">
            <p className="text-xs font-semibold text-gray-400 mb-3">📡 Custom Sensor Input</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                ["temperature_c","Temp (°C)"],["humidity_pct","Humidity (%)"],
                ["wind_speed_kmh","Wind (km/h)"],["rainfall_mm","Rainfall (mm)"],
                ["consecutive_rain_days","Rainy Days"],["rainfall_7day_sum","7-Day Rain (mm)"],
                ["humidity_7day_avg","7-Day Humidity"],["seismic_activity","Seismic Activity"],
                ["ground_vibration","Ground Vibration"],["historical_quakes_5yr","Quakes (5yr)"],
                ["fault_distance_km","Fault Dist (km)"],["depth_km","Depth (km)"],
                ["foreshock_count","Foreshocks"],["heat_index","Heat Index"],
                ["consecutive_hot_days","Hot Days"],["temp_7day_avg","7-Day Avg Temp"],
                ["temp_max_7day","7-Day Max Temp"],["pm2_5","PM2.5"],
                ["pm10","PM10"],["aqi","AQI"],["wind_7day_avg","7-Day Wind"],
              ].map(([key, label]) => (
                <div key={key}>
                  <label className="text-xs text-gray-500 block mb-1">{label}</label>
                  <input type="number" value={inputs[key]}
                    onChange={e => setInputs(p => ({ ...p, [key]: parseFloat(e.target.value)||0 }))}
                    className="w-full bg-gray-800 border border-gray-600 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"/>
                </div>
              ))}
            </div>
            <button onClick={() => runPrediction(inputs)} disabled={loading}
              className="mt-3 bg-blue-600 hover:bg-blue-700 text-white text-xs px-4 py-2 rounded-lg disabled:opacity-50">
              {loading ? "Running…" : "🔍 Run with these values"}
            </button>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 animate-pulse">
            {[...Array(4)].map((_,i) => (
              <div key={i} className="h-32 bg-gray-700 rounded-lg"/>
            ))}
          </div>
        )}

        {/* Prediction cards */}
        {!loading && predictions && (
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            {Object.entries(predictions).map(([type, data]) => {
              const risk = data?.risk_level || "LOW";
              const rcfg = RISK_COLORS[risk] || RISK_COLORS.LOW;
              return (
                <div key={type} className={`rounded-lg border-l-4 ${rcfg.border} ${rcfg.bg} p-3`}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xl">{DISASTER_ICONS[type]}</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${rcfg.badge}`}>
                      {risk}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-white">{DISASTER_LABELS[type]}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{data?.probability}% confidence</p>
                  {["LOW","MEDIUM","HIGH"].map(level => (
                    <div key={level} className="mt-1.5">
                      <div className="flex justify-between text-xs text-gray-500 mb-0.5">
                        <span>{level}</span>
                        <span>{data?.all_probabilities?.[level]||0}%</span>
                      </div>
                      <div className="bg-gray-700 rounded h-1">
                        <div className={`h-1 rounded transition-all duration-700 ${
                          level==="HIGH"?"bg-red-500":level==="MEDIUM"?"bg-yellow-400":"bg-green-500"
                        }`} style={{ width:`${data?.all_probabilities?.[level]||0}%` }}/>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showAlert && (
        <CityAlertSender city={city} predictions={predictions} onClose={() => setShowAlert(false)}/>
      )}
      <PredictionHistory/>
    </div>
  );
}

// ── Trend Chart ───────────────────────────────────────────
function TrendChart({ city }) {
  const [data,    setData]    = useState([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [metric,  setMetric]  = useState("all");

  useEffect(() => {
    if (!city) return;
    setLoading(true);
    setError(null);
    axios.get(`${BASE}/monitor/${city}/trend`)
      .then(res => {
        setData([...res.data].reverse().map(d => ({
          time:        d.timestamp?.slice(11,16) || "",
          temperature: d.weather?.temperature,
          rainfall:    d.weather?.rainfall,
          wind_speed:  d.weather?.wind_speed,
          risk_score:  d.risk_score,
        })));
      })
      .catch(() => setError("No trend data available yet"))
      .finally(() => setLoading(false));
  }, [city]);

  if (!city) return null;

  const METRICS = {
    all:  [
      { key:"temperature", color:"#ef4444", name:"Temp °C" },
      { key:"rainfall",    color:"#3b82f6", name:"Rainfall mm" },
      { key:"wind_speed",  color:"#f59e0b", name:"Wind km/h" },
    ],
    risk: [{ key:"risk_score",  color:"#8b5cf6", name:"Risk Score" }],
    temp: [{ key:"temperature", color:"#ef4444", name:"Temp °C" }],
    rain: [{ key:"rainfall",    color:"#3b82f6", name:"Rainfall mm" }],
    wind: [{ key:"wind_speed",  color:"#f59e0b", name:"Wind km/h" }],
  };
  const lines = METRICS[metric] || [];

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 p-5 shadow-sm mb-6">
      <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
        <h3 className="font-bold text-white">📈 Weather & Risk Trend — {city}</h3>
        <div className="flex gap-1 flex-wrap">
          {[["all","All"],["risk","Risk"],["temp","Temp"],["rain","Rain"],["wind","Wind"]].map(([id,label]) => (
            <button key={id} onClick={() => setMetric(id)}
              className={`text-xs px-3 py-1.5 rounded-lg transition ${
                metric===id ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"
              }`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="h-52 bg-gray-700 animate-pulse rounded-lg"/>
      )}

      {error && !loading && (
        <div className="h-52 flex items-center justify-center text-gray-500">
          <div className="text-center">
            <p className="text-2xl mb-2">📊</p>
            <p className="text-sm">{error}</p>
            <p className="text-xs mt-1">Data will appear after first monitor cycle</p>
          </div>
        </div>
      )}

      {!loading && !error && data.length > 0 && (
        <>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151"/>
              <XAxis dataKey="time" tick={{ fontSize:11, fill:"#9ca3af" }}/>
              <YAxis tick={{ fontSize:11, fill:"#9ca3af" }}/>
              <Tooltip
                contentStyle={{ background:"#1f2937", border:"1px solid #374151", borderRadius:"8px" }}
                labelStyle={{ color:"#f9fafb" }}
              />
              {metric==="risk" && (
                <>
                  <ReferenceLine y={50} stroke="#f97316" strokeDasharray="4 2"
                    label={{ value:"HIGH", fontSize:10, fill:"#f97316" }}/>
                  <ReferenceLine y={75} stroke="#dc2626" strokeDasharray="4 2"
                    label={{ value:"CRITICAL", fontSize:10, fill:"#dc2626" }}/>
                </>
              )}
              {lines.map(l => (
                <Line key={l.key} type="monotone" dataKey={l.key}
                  stroke={l.color} strokeWidth={2} dot={false} name={l.name}/>
              ))}
            </LineChart>
          </ResponsiveContainer>
          <div className="flex gap-4 mt-2 flex-wrap">
            {lines.map(l => (
              <span key={l.key} className="flex items-center gap-1.5 text-xs text-gray-400">
                <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor:l.color }}/>
                {l.name}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Main MonitorPage ──────────────────────────────────────
export default function MonitorPage() {
  const [cities,      setCities]      = useState([]);
  const [selected,    setSelected]    = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [sortBy,      setSortBy]      = useState("risk");
  const [error,       setError]       = useState(null);

  const fetchMonitor = useCallback(async (manual=false) => {
    if (manual) setRefreshing(true);
    setError(null);
    try {
      const res = await axios.get(`${BASE}/monitor`);
      if (Array.isArray(res.data) && res.data.length > 0) {
        setCities(res.data);
        setLastUpdated(new Date().toLocaleTimeString());
      } else {
        // DB empty — trigger live refresh from backend
        setError("No data yet — triggering refresh…");
        const ref = await axios.post(`${BASE}/monitor/refresh`);
        if (Array.isArray(ref.data) && ref.data.length > 0) {
          setCities(ref.data);
          setLastUpdated(new Date().toLocaleTimeString());
          setError(null);
        }
      }
    } catch (e) {
      console.error("Monitor fetch error:", e);
      setError("Cannot reach backend — is it running?");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const manualRefresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const res = await axios.post(`${BASE}/monitor/refresh`);
      if (Array.isArray(res.data) && res.data.length > 0) {
        setCities(res.data);
        setLastUpdated(new Date().toLocaleTimeString());
      }
    } catch (e) {
      setError("Refresh failed — check backend");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchMonitor();
    const interval = setInterval(() => fetchMonitor(), 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchMonitor]);

  const sorted = [...cities].sort((a,b) => {
    if (sortBy==="risk")
      return (RISK_ORDER[a.risk_level]??4) - (RISK_ORDER[b.risk_level]??4);
    return a.city.localeCompare(b.city);
  });

  const counts = {
    CRITICAL: cities.filter(c => c.risk_level==="CRITICAL").length,
    HIGH:     cities.filter(c => c.risk_level==="HIGH").length,
    MEDIUM:   cities.filter(c => c.risk_level==="MEDIUM").length,
    LOW:      cities.filter(c => c.risk_level==="LOW").length,
  };

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="text-center">
        <p className="text-4xl mb-3 animate-spin">🛰️</p>
        <p className="text-gray-400 text-lg">Loading monitor data…</p>
        <p className="text-gray-600 text-sm mt-1">Fetching weather for all cities</p>
      </div>
    </div>
  );

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-start mb-6 flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white">🛰️ Disaster Monitor</h2>
          <p className="text-gray-400 text-sm">
            Auto-refreshes every 10 min · {cities.length} cities tracked
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <select value={sortBy} onChange={e => setSortBy(e.target.value)}
            className="text-xs bg-gray-800 border border-gray-700 text-gray-300 rounded-lg px-3 py-1.5">
            <option value="risk">Sort: By Risk</option>
            <option value="name">Sort: By Name</option>
          </select>
          {lastUpdated && (
            <p className="text-xs text-gray-500">Updated: {lastUpdated}</p>
          )}
          <button onClick={manualRefresh} disabled={refreshing}
            className="text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg transition flex items-center gap-1.5">
            {refreshing ? <><span className="animate-spin">⟳</span> Refreshing…</> : "🔄 Refresh Now"}
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-red-900/30 border border-red-700 text-red-300 rounded-xl px-4 py-3 mb-4 text-sm flex items-center gap-2">
          ⚠️ {error}
        </div>
      )}

      {/* Risk summary counts */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          ["CRITICAL", counts.CRITICAL, "border-red-600    bg-red-950/50   text-red-400"   ],
          ["HIGH",     counts.HIGH,     "border-orange-500 bg-orange-950/50 text-orange-400"],
          ["MEDIUM",   counts.MEDIUM,   "border-yellow-500 bg-yellow-950/50 text-yellow-400"],
          ["LOW",      counts.LOW,      "border-green-500  bg-green-950/50  text-green-400" ],
        ].map(([label, count, cls]) => (
          <div key={label} className={`border rounded-xl px-4 py-4 text-center ${cls}`}>
            <p className="text-3xl font-bold">{count}</p>
            <p className="text-xs opacity-70 mt-1 tracking-wider">{label}</p>
          </div>
        ))}
      </div>

      {/* City cards */}
      {sorted.length === 0 ? (
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-10 text-center mb-6">
          <p className="text-4xl mb-3">🛰️</p>
          <p className="text-gray-300 font-semibold mb-1">No city data yet</p>
          <p className="text-gray-500 text-sm mb-4">
            Click "Refresh Now" to fetch live weather and predictions for all cities
          </p>
          <button onClick={manualRefresh} disabled={refreshing}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
            {refreshing ? "⟳ Refreshing…" : "🔄 Fetch City Data"}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
          {sorted.map(city => (
            <CityCard key={city.city} city={city} onSelect={setSelected} selected={selected}/>
          ))}
        </div>
      )}

      {/* AI Predictions Panel */}
      <CityPredictionPanel city={selected}/>

      {/* Trend Chart */}
      <TrendChart city={selected}/>
    </div>
  );
}