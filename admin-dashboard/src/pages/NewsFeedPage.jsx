import { useEffect, useState } from "react";
import axios from "axios";

const CATEGORIES = ["All", "Flood", "Earthquake", "Heatwave", "Air Quality", "Cyclone"];

const MOCK_NEWS = [
  { id:1, title:"Heavy rainfall warning issued for Punjab and Haryana", category:"Flood", source:"IMD", time:"2 hours ago", severity:"HIGH", summary:"The Indian Meteorological Department has issued a red alert for heavy to very heavy rainfall in parts of Punjab and Haryana over the next 48 hours." },
  { id:2, title:"Air quality in Delhi deteriorates to 'Severe' category", category:"Air Quality", source:"CPCB", time:"4 hours ago", severity:"HIGH", summary:"Delhi's AQI crossed 400 as vehicular emissions combined with stubble burning pushed air quality to severe levels." },
  { id:3, title:"Heatwave conditions likely in Rajasthan this week", category:"Heatwave", source:"IMD", time:"6 hours ago", severity:"MEDIUM", summary:"Temperatures expected to touch 47°C in parts of Rajasthan as heatwave conditions intensify." },
  { id:4, title:"Minor tremors recorded near Dharamshala", category:"Earthquake", source:"NCS", time:"8 hours ago", severity:"LOW", summary:"A magnitude 3.2 earthquake was recorded 40km north of Dharamshala at a depth of 10km. No damage reported." },
  { id:5, title:"Flood alert issued for river Sutlej in Ludhiana", category:"Flood", source:"CWC", time:"12 hours ago", severity:"MEDIUM", summary:"Water levels in river Sutlej are rising due to heavy upstream rainfall. Residents in low-lying areas advised to stay alert." },
  { id:6, title:"Cyclone warning lifted for Odisha coast", category:"Cyclone", source:"IMD", time:"1 day ago", severity:"LOW", summary:"The depression over Bay of Bengal has weakened and cyclone warning has been lifted for the Odisha coast." },
];

const SEVERITY_STYLES = {
  HIGH:   "bg-red-100 text-red-700 border-red-200",
  MEDIUM: "bg-yellow-100 text-yellow-700 border-yellow-200",
  LOW:    "bg-green-100 text-green-700 border-green-200",
};

const CATEGORY_ICONS = {
  Flood: "🌊", Earthquake: "🌍", Heatwave: "🔥",
  "Air Quality": "💨", Cyclone: "🌀", All: "📰",
};

export default function NewsFeedPage() {
  const [news, setNews]           = useState(MOCK_NEWS);
  const [filter, setFilter]       = useState("All");
  const [loading, setLoading]     = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date().toLocaleTimeString());

  const refresh = async () => {
    setLoading(true);
    await new Promise(r => setTimeout(r, 800));
    setNews([...MOCK_NEWS].sort(() => Math.random() - 0.5));
    setLastUpdated(new Date().toLocaleTimeString());
    setLoading(false);
  };

  const filtered = filter === "All" ? news : news.filter(n => n.category === filter);
  const highCount = news.filter(n => n.severity === "HIGH").length;

  return (
    <div>
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-1">📰 Disaster News Feed</h2>
          <p className="text-gray-500 text-sm">Latest alerts and disaster news from official sources</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-400">Updated: {lastUpdated}</p>
          <button onClick={refresh} className="text-xs text-blue-500 hover:underline mt-1">
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-3 text-center">
          <p className="text-2xl font-bold text-red-600">{highCount}</p>
          <p className="text-xs text-gray-500">High Severity</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-3 text-center">
          <p className="text-2xl font-bold text-blue-600">{news.length}</p>
          <p className="text-xs text-gray-500">Total Alerts</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-3 text-center">
          <p className="text-2xl font-bold text-green-600">5</p>
          <p className="text-xs text-gray-500">Sources</p>
        </div>
      </div>

      {/* Category filter */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {CATEGORIES.map(cat => (
          <button key={cat} onClick={() => setFilter(cat)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
              filter === cat ? "bg-blue-500 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}>
            {CATEGORY_ICONS[cat]} {cat}
          </button>
        ))}
      </div>

      {/* News cards */}
      {loading ? (
        <p className="text-gray-400 text-center py-10">Loading news...</p>
      ) : (
        <div className="space-y-4">
          {filtered.map(item => (
            <div key={item.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm hover:shadow-md transition">
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                  <span>{CATEGORY_ICONS[item.category]}</span>
                  <span className="text-xs text-gray-500 font-medium">{item.category}</span>
                  <span className="text-xs text-gray-300">•</span>
                  <span className="text-xs text-gray-400">{item.source}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${SEVERITY_STYLES[item.severity]}`}>
                    {item.severity}
                  </span>
                  <span className="text-xs text-gray-400">{item.time}</span>
                </div>
              </div>
              <h3 className="font-semibold text-gray-800 dark:text-white mb-2">{item.title}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">{item.summary}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}