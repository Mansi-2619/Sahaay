import { useEffect, useState, useCallback, useRef } from "react";
import { getDashboard } from "../services/api";
import RiskBanner from "../components/RiskBanner";
import StatsPanel from "../components/StatsPanel";
import SOSFeed    from "../components/SOSFeed";
import MapView    from "../components/MapView";
import toast      from "react-hot-toast";
import axios      from "axios";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  ResponsiveContainer, Tooltip,
} from "recharts";

const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

const RISK_STYLES = {
  CRITICAL: "bg-red-100 text-red-800 border-red-400",
  HIGH:     "bg-red-100 text-red-700 border-red-300",
  MEDIUM:   "bg-yellow-100 text-yellow-700 border-yellow-300",
  LOW:      "bg-green-100 text-green-700 border-green-300",
};
const DISASTER_ICONS  = { flood:"🌊", earthquake:"🌍", heatwave:"🔥", air_quality:"💨" };
const DISASTER_LABELS = { flood:"Flood", earthquake:"Earthquake", heatwave:"Heatwave", air_quality:"Air Quality" };
const RISK_SCORE      = { LOW:20, MEDIUM:55, HIGH:90 };
const RISK_COLOR      = { CRITICAL:"#dc2626", HIGH:"#f97316", MEDIUM:"#eab308", LOW:"#22c55e" };

// ── India Geographic Data ─────────────────────────────────
const INDIA_BOUNDARY = { north:37.6, south:6.4, west:68.0, east:97.5 };
const INDIA_CENTER   = { lat:22.5, lng:80.5 };

const INDIA_STATES = {
  "Andhra Pradesh":    { lat:15.91, lng:79.74 },
  "Arunachal Pradesh": { lat:28.22, lng:94.73 },
  "Assam":             { lat:26.20, lng:92.94 },
  "Bihar":             { lat:25.10, lng:85.31 },
  "Chhattisgarh":      { lat:21.28, lng:81.87 },
  "Goa":               { lat:15.30, lng:74.12 },
  "Gujarat":           { lat:22.26, lng:71.19 },
  "Haryana":           { lat:29.06, lng:76.09 },
  "Himachal Pradesh":  { lat:31.10, lng:77.17 },
  "Jharkhand":         { lat:23.61, lng:85.28 },
  "Karnataka":         { lat:15.32, lng:75.71 },
  "Kerala":            { lat:10.85, lng:76.27 },
  "Madhya Pradesh":    { lat:22.97, lng:78.66 },
  "Maharashtra":       { lat:19.75, lng:75.71 },
  "Manipur":           { lat:24.66, lng:93.91 },
  "Meghalaya":         { lat:25.47, lng:91.37 },
  "Mizoram":           { lat:23.16, lng:92.94 },
  "Nagaland":          { lat:26.16, lng:94.56 },
  "Odisha":            { lat:20.95, lng:85.10 },
  "Punjab":            { lat:31.15, lng:75.34 },
  "Rajasthan":         { lat:27.02, lng:74.22 },
  "Sikkim":            { lat:27.53, lng:88.51 },
  "Tamil Nadu":        { lat:11.13, lng:78.66 },
  "Telangana":         { lat:18.11, lng:79.02 },
  "Tripura":           { lat:23.94, lng:91.99 },
  "Uttar Pradesh":     { lat:26.85, lng:80.95 },
  "Uttarakhand":       { lat:30.07, lng:79.02 },
  "West Bengal":       { lat:22.99, lng:87.85 },
};

const UNION_TERRITORIES = {
  "Delhi":             { lat:28.70, lng:77.10 },
  "Chandigarh":        { lat:30.73, lng:76.78 },
  "J&K":               { lat:33.78, lng:76.58 },
  "Ladakh":            { lat:34.15, lng:77.58 },
  "Puducherry":        { lat:11.94, lng:79.81 },
  "Andaman & Nicobar": { lat:11.74, lng:92.66 },
  "Lakshadweep":       { lat:10.57, lng:72.64 },
};

const CITY_COORDS = {
  Ludhiana:   { lat:30.90, lng:75.85 },
  Chandigarh: { lat:30.73, lng:76.78 },
  Amritsar:   { lat:31.63, lng:74.87 },
  Delhi:      { lat:28.61, lng:77.20 },
  Jaipur:     { lat:26.91, lng:75.79 },
  Mumbai:     { lat:19.07, lng:72.87 },
  Ahmedabad:  { lat:23.02, lng:72.57 },
  Bhopal:     { lat:23.25, lng:77.40 },
  Lucknow:    { lat:26.85, lng:80.95 },
  Patna:      { lat:25.59, lng:85.13 },
  Kolkata:    { lat:22.57, lng:88.36 },
  Hyderabad:  { lat:17.38, lng:78.48 },
  Bangalore:  { lat:12.97, lng:77.59 },
  Chennai:    { lat:13.08, lng:80.27 },
  Pune:       { lat:18.52, lng:73.85 },
};

const INDIA_OUTLINE = [
  [35.5,76.8],[35.8,76.5],[36.0,75.9],[36.2,75.5],[36.5,75.2],
  [36.8,74.8],[37.0,74.3],[36.8,73.8],[36.5,73.5],[36.0,73.8],
  [35.5,73.5],[35.2,74.0],[34.8,74.5],[34.5,73.9],[34.2,73.5],
  [34.0,73.2],[33.7,73.5],[33.4,73.8],[33.0,73.6],[32.7,74.0],
  [32.5,74.3],[32.2,74.5],[32.0,74.8],[31.7,74.6],[31.5,74.9],
  [31.2,74.7],[31.0,74.5],[30.7,73.9],[30.4,73.4],[30.0,72.8],
  [29.6,71.9],[29.3,71.2],[29.0,70.6],[28.6,70.1],[28.3,69.7],
  [28.0,69.3],[27.7,68.9],[27.4,68.6],[27.1,68.2],[26.8,68.1],
  [26.5,68.3],[26.2,68.5],[25.9,68.4],[25.6,68.5],[25.3,68.5],
  [25.0,68.7],[24.7,68.9],[24.4,68.8],[24.1,68.7],[23.8,68.4],
  [23.5,68.2],[23.2,68.1],
  [23.0,68.4],[22.8,68.8],[22.5,69.1],[22.2,69.5],[22.0,70.0],
  [21.8,70.4],[21.5,70.9],[21.3,71.4],[21.0,71.6],[20.7,71.3],
  [20.5,71.0],[20.2,70.7],[20.0,70.3],
  [20.5,71.0],[20.7,71.5],[21.0,72.0],[20.8,72.5],[20.5,72.7],
  [20.2,72.9],[19.9,72.7],[19.7,72.8],[19.4,72.9],[19.1,72.8],
  [18.9,72.9],
  [18.6,73.0],[18.3,73.2],[18.0,73.4],[17.7,73.5],[17.4,73.7],
  [17.1,73.8],[16.8,73.8],[16.5,73.9],[16.2,74.0],[15.9,74.0],
  [15.6,74.0],[15.3,74.1],[15.0,74.2],[14.7,74.3],[14.4,74.4],
  [14.1,74.5],[13.8,74.7],[13.5,74.8],[13.2,74.9],[12.9,74.9],
  [12.6,75.0],[12.3,75.1],[12.0,75.3],[11.7,75.5],[11.4,75.7],
  [11.1,75.9],[10.8,76.1],[10.5,76.3],[10.2,76.5],[9.9,76.7],
  [9.6,76.8],[9.3,77.0],[9.0,77.1],[8.7,77.2],[8.4,77.1],
  [8.2,77.3],[8.1,77.5],
  [8.0,77.6],[8.1,77.9],[8.2,78.2],[8.5,78.5],[8.8,78.8],
  [9.1,79.1],[9.4,79.4],[9.7,79.6],[10.0,79.8],[10.3,79.9],
  [10.6,79.9],[10.9,79.8],
  [11.2,79.7],[11.5,79.8],[11.8,80.0],[12.1,80.1],[12.4,80.2],
  [12.7,80.3],[13.0,80.3],[13.3,80.2],[13.6,80.1],[13.9,80.1],
  [14.2,80.1],[14.5,80.2],[14.8,80.1],[15.1,80.1],[15.4,80.3],
  [15.7,80.5],[16.0,81.1],[16.3,81.7],[16.6,82.3],[16.9,82.7],
  [17.2,82.9],[17.5,83.2],[17.8,83.7],[18.1,84.2],[18.4,84.8],
  [18.7,85.3],[19.0,85.8],[19.3,86.1],[19.6,86.5],[19.9,86.8],
  [20.2,87.0],[20.5,87.2],[20.8,87.4],[21.1,87.5],[21.4,87.6],
  [21.7,87.7],[22.0,88.0],[22.3,88.3],[22.6,88.4],
  [22.9,88.3],[23.2,88.2],[23.5,88.4],[23.8,88.5],[24.1,88.6],
  [24.4,88.5],[24.7,88.3],[25.0,89.0],[25.3,89.5],[25.6,89.8],
  [26.0,90.0],[26.3,90.5],[26.6,90.8],[26.9,91.3],[27.2,91.8],
  [27.4,92.0],[27.5,92.5],[27.3,93.0],[27.1,93.5],
  [27.0,94.0],[27.2,94.5],[27.5,95.0],[27.8,95.5],
  [28.0,96.0],[28.2,96.5],[28.1,97.0],[27.9,97.4],
  [27.6,97.2],[27.4,96.8],[27.1,96.3],[26.8,96.0],
  [26.5,95.5],[26.2,95.0],[25.9,94.5],[25.6,93.8],
  [25.3,93.2],[25.0,92.8],[24.7,92.5],[24.4,92.2],
  [24.1,92.0],[23.8,91.8],[23.5,91.5],[23.2,91.3],
  [23.0,91.5],[23.2,91.9],[23.5,92.2],[23.8,92.5],
  [24.1,93.0],[24.4,93.5],[24.6,94.0],[24.8,94.5],
  [25.0,95.0],[25.3,95.5],[25.6,96.0],[25.9,96.4],
  [26.3,97.0],[26.7,97.3],[27.1,97.5],
  [27.5,97.4],[28.0,97.0],[28.4,96.5],[28.7,96.0],
  [29.0,95.4],[29.2,94.8],[29.4,94.2],[29.5,93.5],
  [29.6,92.8],[29.7,92.0],[29.6,91.3],[29.5,90.5],
  [29.3,89.8],[29.1,89.0],[28.9,88.2],[28.6,87.5],
  [28.3,87.0],[27.9,86.5],[27.5,86.0],[27.1,85.5],
  [26.8,85.0],[26.5,84.5],[26.3,84.0],[26.1,83.5],
  [26.0,83.0],[25.9,82.5],[25.8,82.0],[25.7,81.5],
  [25.6,81.0],[25.5,80.5],[25.4,80.0],[25.3,79.5],
  [30.5,79.0],[30.8,78.5],[31.1,78.0],[31.4,77.5],
  [31.7,77.0],[32.0,76.5],[32.3,76.0],[32.6,75.8],
  [32.9,76.0],[33.2,75.8],[33.5,75.5],[33.8,75.2],
  [34.1,75.0],[34.4,74.8],[34.7,74.5],[35.0,74.8],
  [35.2,75.2],[35.5,75.5],[35.5,76.8],
];

const STATE_BORDERS = [
  [[24.3,72.0],[24.0,73.5],[23.5,74.0]],
  [[21.5,74.5],[21.0,76.0],[20.5,78.0],[20.0,80.0]],
  [[18.5,78.5],[17.5,79.5],[16.5,80.5]],
  [[12.5,77.0],[11.5,77.5],[10.5,78.0]],
  [[25.5,83.5],[26.0,84.5],[27.0,85.0]],
  [[21.5,86.5],[22.0,87.0],[22.5,87.5]],
];

// ── Disaster-Prone Regions ────────────────────────────────
// Each zone: name, color, primary disaster type, polygon [lat,lng]
const DISASTER_ZONES = [
  {
    name: "Odisha",
    type: "Cyclone / Flood",
    color: "255,80,0",       // orange
    icon: "🌀",
    // Odisha state approximate polygon
    poly: [
      [22.5,86.5],[22.0,87.0],[21.5,87.2],[21.0,86.8],[20.5,86.5],
      [20.0,85.8],[19.5,85.2],[19.0,84.7],[18.8,84.2],[19.0,83.5],
      [19.5,83.0],[20.0,82.5],[20.5,82.0],[21.0,82.2],[21.5,82.8],
      [22.0,83.5],[22.5,84.5],[23.0,85.5],[22.5,86.5],
    ],
  },
  {
    name: "West Bengal",
    type: "Cyclone / Flood",
    color: "255,50,50",      // red
    icon: "🌊",
    poly: [
      [27.0,88.5],[26.5,89.0],[26.0,89.5],[25.5,89.0],[25.0,88.5],
      [24.0,88.2],[23.5,88.4],[22.5,88.3],[22.0,88.0],[21.8,87.5],
      [22.0,87.0],[22.5,86.5],[23.0,86.8],[23.5,87.2],[24.0,87.8],
      [24.5,88.0],[25.5,88.5],[26.0,88.8],[27.0,88.5],
    ],
  },
  {
    name: "Andhra Pradesh",
    type: "Cyclone / Flood",
    color: "255,120,0",      // amber-orange
    icon: "🌀",
    poly: [
      [19.0,84.7],[18.5,84.2],[18.0,83.8],[17.5,83.2],[17.0,82.5],
      [16.5,82.0],[16.0,81.5],[15.5,80.8],[15.0,80.2],[14.5,80.1],
      [14.0,80.1],[13.5,80.0],[13.6,79.5],[14.0,79.0],[14.5,79.2],
      [15.0,79.5],[15.5,79.8],[16.0,80.5],[16.5,81.0],[17.0,81.8],
      [17.5,82.5],[18.0,83.2],[18.5,83.8],[19.0,84.7],
    ],
  },
  {
    name: "Tamil Nadu",
    type: "Cyclone / Drought",
    color: "220,50,200",     // magenta
    icon: "🌀",
    poly: [
      [13.5,80.0],[13.0,80.3],[12.5,80.2],[12.0,80.0],[11.5,79.8],
      [11.0,79.5],[10.5,79.0],[10.0,79.0],[9.5,78.5],[9.0,78.0],
      [8.5,77.8],[8.0,77.6],[8.2,77.2],[8.7,76.8],[9.2,77.0],
      [9.8,77.3],[10.5,77.8],[11.0,78.0],[11.5,78.5],[12.0,79.0],
      [12.5,79.5],[13.0,79.8],[13.5,80.0],
    ],
  },
  {
    name: "Assam",
    type: "Flood / Earthquake",
    color: "0,200,255",      // cyan
    icon: "🌊",
    poly: [
      [27.5,92.0],[27.0,92.5],[26.5,92.8],[26.0,92.5],[25.5,92.0],
      [25.0,91.5],[24.5,91.0],[24.0,90.5],[24.2,90.0],[24.8,89.5],
      [25.2,89.8],[25.8,90.2],[26.2,90.8],[26.8,91.5],[27.2,91.8],
      [27.5,92.0],
    ],
  },
  {
    name: "Bihar",
    type: "Flood",
    color: "80,180,255",     // light blue
    icon: "🌊",
    poly: [
      [27.5,85.5],[27.0,86.0],[26.5,86.5],[26.0,87.0],[25.5,87.0],
      [25.0,86.5],[24.5,86.0],[24.0,85.5],[24.2,85.0],[24.8,84.5],
      [25.5,84.0],[26.0,83.5],[26.5,84.0],[27.0,84.8],[27.5,85.5],
    ],
  },
  {
    name: "Uttar Pradesh",
    type: "Flood / Earthquake",
    color: "255,220,0",      // yellow
    icon: "⚡",
    poly: [
      [30.5,77.5],[30.0,78.5],[29.5,79.5],[29.0,80.5],[28.5,81.5],
      [28.0,82.5],[27.5,83.5],[27.0,84.0],[26.5,84.0],[26.0,83.5],
      [25.5,83.0],[25.3,82.0],[25.5,81.0],[26.0,80.0],[26.5,79.0],
      [27.0,78.5],[27.5,78.0],[28.0,77.5],[28.5,77.2],[29.0,77.0],
      [29.5,77.2],[30.0,77.3],[30.5,77.5],
    ],
  },
];

function geoToCanvas(lat, lng, W, H, pad) {
  const pw = W - pad * 2;
  const ph = H - pad * 2;
  const x  = pad + ((lng - INDIA_BOUNDARY.west)  / (INDIA_BOUNDARY.east  - INDIA_BOUNDARY.west))  * pw;
  const y  = pad + (1 - (lat - INDIA_BOUNDARY.south) / (INDIA_BOUNDARY.north - INDIA_BOUNDARY.south)) * ph;
  return [x, y];
}

// ── Animated India Radar (ONE definition only) ────────────
function AnimatedRadar({ predictions, sosSignals = [] }) {
  const canvasRef = useRef(null);
  const animRef   = useRef(null);
  const sweepXRef = useRef(0); // radians (0..2π)
  const sosBlipsRef = useRef([]); // {x,y,alpha}
  const timeRef   = useRef(0);

  const riskData = predictions
    ? Object.entries(predictions).map(([type, d]) => ({
        type, label: DISASTER_LABELS[type], icon: DISASTER_ICONS[type],
        risk: d?.risk_level || "LOW", score: RISK_SCORE[d?.risk_level] ?? 20,
        prob: d?.probability ?? 0,
      }))
    : [];

  const dominantRisk  = [...riskData].sort((a,b) => b.score-a.score)[0]?.risk  || "LOW";
  const dominantScore = [...riskData].sort((a,b) => b.score-a.score)[0]?.score || 20;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const setSize = () => {
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    setSize();
    window.addEventListener("resize", setSize);

    const draw = () => {
      const W = canvas.width, H = canvas.height;
      if (!W || !H) { animRef.current = requestAnimationFrame(draw); return; }
      timeRef.current++;

      const PAD = Math.min(W * 0.07, H * 0.07);

      // Background
      ctx.fillStyle = "#000e06";
      ctx.fillRect(0, 0, W, H);

      // Scanlines
      for (let y = 0; y < H; y += 4) {
        ctx.fillStyle = "rgba(0,0,0,0.09)";
        ctx.fillRect(0, y, W, 1);
      }

      // Vignette
      const vig = ctx.createRadialGradient(W/2,H/2,H*0.2,W/2,H/2,H);
      vig.addColorStop(0, "transparent");
      vig.addColorStop(1, "rgba(0,0,0,0.6)");
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, W, H);

      // Lat/Lng grid
      ctx.setLineDash([1,10]); ctx.lineWidth = 0.4;
      for (let lat = 10; lat <= 35; lat += 5) {
        const [x1,y1] = geoToCanvas(lat, INDIA_BOUNDARY.west, W, H, PAD);
        const [x2   ] = geoToCanvas(lat, INDIA_BOUNDARY.east, W, H, PAD);
        ctx.strokeStyle = lat===20 ? "rgba(0,255,80,0.12)" : "rgba(0,255,80,0.06)";
        ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y1); ctx.stroke();
        ctx.fillStyle="rgba(0,255,80,0.22)"; ctx.font="7px monospace"; ctx.textAlign="left";
        ctx.fillText(`${lat}°N`, 3, y1+3);
      }
      for (let lng = 70; lng <= 95; lng += 5) {
        const [x1,y1] = geoToCanvas(INDIA_BOUNDARY.south, lng, W, H, PAD);
        const [  ,y2] = geoToCanvas(INDIA_BOUNDARY.north, lng, W, H, PAD);
        ctx.strokeStyle = lng===80 ? "rgba(0,255,80,0.12)" : "rgba(0,255,80,0.06)";
        ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x1,y2); ctx.stroke();
        ctx.fillStyle="rgba(0,255,80,0.22)"; ctx.font="7px monospace"; ctx.textAlign="center";
        ctx.fillText(`${lng}°E`, x1, H-3);
      }
      ctx.setLineDash([]); ctx.textAlign="left";

      // India filled shape
      ctx.beginPath();
      INDIA_OUTLINE.forEach(([lat,lng],i) => {
        const [x,y] = geoToCanvas(lat,lng,W,H,PAD);
        i===0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y);
      });
      ctx.closePath();
      const mapFill = ctx.createLinearGradient(0,PAD,0,H-PAD);
      mapFill.addColorStop(0,   "rgba(0,60,30,0.35)");
      mapFill.addColorStop(0.5, "rgba(0,40,20,0.25)");
      mapFill.addColorStop(1,   "rgba(0,20,10,0.15)");
      ctx.fillStyle=mapFill; ctx.fill();

      // Border — primary glow
      ctx.save();
      ctx.shadowColor="#00ff80"; ctx.shadowBlur=12;
      ctx.strokeStyle="rgba(0,255,100,0.8)"; ctx.lineWidth=2;
      ctx.stroke(); ctx.restore();

      // Border — outer soft glow
      ctx.beginPath();
      INDIA_OUTLINE.forEach(([lat,lng],i) => {
        const [x,y] = geoToCanvas(lat,lng,W,H,PAD);
        i===0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y);
      });
      ctx.closePath();
      ctx.strokeStyle="rgba(0,255,80,0.18)"; ctx.lineWidth=5; ctx.stroke();

      // State border dashed lines
      STATE_BORDERS.forEach(border => {
        ctx.beginPath();
        border.forEach(([lat,lng],i) => {
          const [x,y] = geoToCanvas(lat,lng,W,H,PAD);
          i===0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y);
        });
        ctx.strokeStyle="rgba(0,255,80,0.12)"; ctx.lineWidth=0.8;
        ctx.setLineDash([3,5]); ctx.stroke(); ctx.setLineDash([]);
      });

      // ── Disaster-prone zone overlays ──────────────────────
      const zonePulse = Math.sin(timeRef.current * 0.04) * 0.5 + 0.5; // 0–1 slow pulse
      DISASTER_ZONES.forEach(zone => {
        const [r,g,b] = zone.color.split(",").map(Number);

        // Filled polygon
        ctx.beginPath();
        zone.poly.forEach(([lat,lng],i) => {
          const [x,y] = geoToCanvas(lat,lng,W,H,PAD);
          i===0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y);
        });
        ctx.closePath();

        // Pulsing fill
        const fillAlpha = 0.10 + zonePulse * 0.12;
        ctx.fillStyle = `rgba(${r},${g},${b},${fillAlpha})`;
        ctx.fill();

        // Pulsing border
        ctx.save();
        ctx.shadowColor = `rgba(${r},${g},${b},0.9)`;
        ctx.shadowBlur  = 8 + zonePulse * 10;
        ctx.strokeStyle = `rgba(${r},${g},${b},${0.5 + zonePulse * 0.4})`;
        ctx.lineWidth   = 1.5;
        ctx.setLineDash([4,3]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        // Zone label at centroid
        const lats = zone.poly.map(p=>p[0]);
        const lngs = zone.poly.map(p=>p[1]);
        const cLat = lats.reduce((a,b)=>a+b,0)/lats.length;
        const cLng = lngs.reduce((a,b)=>a+b,0)/lngs.length;
        const [lx,ly] = geoToCanvas(cLat,cLng,W,H,PAD);

        // Icon
        ctx.save();
        ctx.font      = `${Math.max(11,W*0.014)}px serif`;
        ctx.textAlign = "center";
        ctx.globalAlpha = 0.75 + zonePulse * 0.25;
        ctx.fillText(zone.icon, lx, ly - 4);
        ctx.restore();

        // Name label
        if (W > 480) {
          ctx.save();
          ctx.fillStyle   = `rgba(${r},${g},${b},${0.7 + zonePulse * 0.3})`;
          ctx.font        = `bold ${Math.max(7,W*0.009)}px monospace`;
          ctx.textAlign   = "center";
          ctx.shadowColor = `rgba(${r},${g},${b},0.8)`;
          ctx.shadowBlur  = 6;
          ctx.fillText(zone.name, lx, ly + 10);
          ctx.restore();
        }
      });

      // State capital dots + labels
      Object.entries(INDIA_STATES).forEach(([name,coords]) => {
        const [x,y] = geoToCanvas(coords.lat,coords.lng,W,H,PAD);
        if (x<0||x>W||y<0||y>H) return;
        ctx.save();
        ctx.fillStyle="rgba(0,255,80,0.25)"; ctx.shadowColor="#00ff80"; ctx.shadowBlur=4;
        ctx.beginPath(); ctx.arc(x,y,2,0,Math.PI*2); ctx.fill(); ctx.restore();
        if (W > 500) {
          ctx.fillStyle="rgba(0,255,80,0.28)"; ctx.font="6px monospace";
          ctx.fillText(name.split(" ")[0], x+3, y-2);
        }
      });

      // Union Territory dots (cyan)
      Object.entries(UNION_TERRITORIES).forEach(([,coords]) => {
        const [x,y] = geoToCanvas(coords.lat,coords.lng,W,H,PAD);
        if (x<0||x>W||y<0||y>H) return;
        ctx.save();
        ctx.fillStyle="rgba(0,200,255,0.35)"; ctx.shadowColor="#00ccff"; ctx.shadowBlur=4;
        ctx.beginPath(); ctx.arc(x,y,2.5,0,Math.PI*2); ctx.fill(); ctx.restore();
      });

      // India center crosshair
      const [cX,cY] = geoToCanvas(INDIA_CENTER.lat,INDIA_CENTER.lng,W,H,PAD);
      ctx.save();
      ctx.strokeStyle="rgba(0,255,80,0.2)"; ctx.lineWidth=0.8; ctx.setLineDash([3,5]);
      ctx.beginPath(); ctx.moveTo(cX-16,cY); ctx.lineTo(cX+16,cY); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cX,cY-16); ctx.lineTo(cX,cY+16); ctx.stroke();
      ctx.setLineDash([]); ctx.restore();

      // Radar scanner sweep (rotating from India center) – scans SOS only
      const sweepAngle = sweepXRef.current;
      const maxR = Math.max(20, Math.min(W, H) * 0.5);

      ctx.save();
      ctx.lineWidth = 2;
      // trailing rays
      for (let i = 0; i < 70; i++) {
        const t = i / 70;
        const a = sweepAngle - t * 0.55; // ~31° trail
        const al = (1 - t) * 0.22;
        ctx.strokeStyle = `rgba(0,255,120,${al})`;
        ctx.beginPath();
        ctx.moveTo(cX, cY);
        ctx.lineTo(cX + Math.cos(a) * maxR, cY + Math.sin(a) * maxR);
        ctx.stroke();
      }
      // main ray
      ctx.shadowColor = "rgba(0,255,180,0.95)";
      ctx.shadowBlur = 22;
      ctx.strokeStyle = "rgba(0,255,180,0.95)";
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(cX, cY);
      ctx.lineTo(cX + Math.cos(sweepAngle) * maxR, cY + Math.sin(sweepAngle) * maxR);
      ctx.stroke();
      ctx.restore();

      // SOS blips (always visible, brighter when the scanner passes)
      const hitWindow = 0.25; // radians (~14°)
      sosSignals.forEach((sos) => {
        if (!sos.latitude || !sos.longitude) return;
        const [x, y] = geoToCanvas(sos.latitude, sos.longitude, W, H, PAD);
        if (x < 0 || x > W || y < 0 || y > H) return;

        const dx = x - cX;
        const dy = y - cY;
        const a = Math.atan2(dy, dx);
        let diff = Math.abs(a - sweepAngle);
        diff = Math.min(diff, Math.PI * 2 - diff);
        const underScan = diff < hitWindow;

        const pulse = Math.sin(timeRef.current * 0.12) * 0.5 + 0.5;
        const coreAlpha = 0.45 + 0.35 * pulse + (underScan ? 0.35 : 0);
        const ringAlpha = 0.18 + 0.25 * pulse + (underScan ? 0.25 : 0);

        // Outer pulsing ring
        ctx.save();
        ctx.shadowColor = "rgba(255,0,0,0.9)";
        ctx.shadowBlur = 18;
        ctx.strokeStyle = `rgba(255,80,80,${ringAlpha})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, 8 + 6 * pulse, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // Core dot
        ctx.save();
        ctx.fillStyle = `rgba(255,80,80,${coreAlpha})`;
        ctx.shadowColor = "rgba(255,0,0,0.9)";
        ctx.shadowBlur = 22;
        ctx.beginPath();
        ctx.arc(x, y, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // SOS label
        ctx.save();
        ctx.fillStyle = `rgba(255,160,160,${0.9 + (underScan ? 0.1 : 0)})`;
        ctx.font = `bold ${Math.max(9, W * 0.013)}px monospace`;
        ctx.fillText("SOS", x + 8, y + 4);
        ctx.restore();
      });

      // HUD corners
      const C=22;
      ctx.strokeStyle="rgba(0,255,80,0.35)"; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.moveTo(7,7+C); ctx.lineTo(7,7); ctx.lineTo(7+C,7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(W-7-C,7); ctx.lineTo(W-7,7); ctx.lineTo(W-7,7+C); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(7,H-7-C); ctx.lineTo(7,H-7); ctx.lineTo(7+C,H-7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(W-7-C,H-7); ctx.lineTo(W-7,H-7); ctx.lineTo(W-7,H-7-C); ctx.stroke();

      // HUD text
      const fs=Math.max(9,W*0.012);
      ctx.fillStyle="rgba(0,255,80,0.4)"; ctx.font=`${fs}px monospace`; ctx.textAlign="left";
      ctx.fillText(`SCAN`,12,H-22);
      ctx.fillText(`SOS: ${sosSignals.length} ACTIVE`,12,H-8);
      ctx.textAlign="right";
      ctx.fillText(new Date().toLocaleTimeString(),W-12,H-8);
      ctx.fillText("SAHAAY — INDIA SURVEILLANCE",W-12,H-22);

      // Compass
      ctx.fillStyle="rgba(0,255,80,0.55)"; ctx.font=`bold ${fs+1}px monospace`;
      ctx.textAlign="center";
      ctx.fillText("N",W/2,PAD-10); ctx.fillText("S",W/2,H-PAD+18);
      ctx.textAlign="left";  ctx.fillText("W",PAD-24,H/2+4);
      ctx.textAlign="right"; ctx.fillText("E",W-PAD+24,H/2+4);
      ctx.textAlign="left";

      sweepXRef.current += 0.03;
      if (sweepXRef.current > Math.PI * 2) sweepXRef.current -= Math.PI * 2;
      animRef.current=requestAnimationFrame(draw);
    };

    draw();
    return () => { cancelAnimationFrame(animRef.current); window.removeEventListener("resize",setSize); };
  }, [predictions, sosSignals]);

  return (
    <div className="w-full bg-gray-950 rounded-2xl border border-green-900/60 shadow-2xl overflow-hidden"
      style={{ boxShadow:"0 0 60px rgba(0,255,80,0.07),0 0 120px rgba(0,0,0,0.8)" }}>

      {/* Top bar */}
      <div className="flex justify-between items-center px-5 py-3 border-b border-green-900/40"
        style={{ background:"linear-gradient(90deg,#001208,#000a05,#001208)" }}>
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-2.5 h-2.5 rounded-full bg-green-400"/>
            <div className="w-2.5 h-2.5 rounded-full bg-green-400 animate-ping absolute inset-0 opacity-50"/>
          </div>
          <span className="text-green-400 text-sm font-mono font-bold tracking-[0.2em]">
            SAHAAY SURVEILLANCE — INDIA
          </span>
          <span className="text-green-900 text-xs font-mono hidden md:block">
            28 States · 8 UTs · {Object.keys(CITY_COORDS).length} Cities Monitored
          </span>
        </div>
        <div className="flex items-center gap-4">
          {sosSignals.length > 0 && (
            <span className="text-red-400 text-xs font-mono font-bold animate-pulse">
              ⚠ {sosSignals.length} SOS ACTIVE
            </span>
          )}
          <span className="text-green-700 text-xs font-mono">
            {new Date().toLocaleDateString("en-IN")}
          </span>
        </div>
      </div>

      {/* Canvas */}
      <div className="relative w-full" style={{ paddingBottom:"62%" }}>
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full"/>
      </div>

      {/* Bottom legend */}
      <div className="px-5 py-3 border-t border-green-900/40"
        style={{ background:"linear-gradient(90deg,#000a05,#001208,#000a05)" }}>
        <div className="flex justify-between items-center flex-wrap gap-3">
          <div className="flex gap-5 flex-wrap">
            {riskData.map(d => (
              <div key={d.type} className="flex items-center gap-1.5">
                <span className="text-base">{d.icon}</span>
                <div>
                  <p className="text-xs font-mono leading-none"
                    style={{ color:d.risk==="HIGH"?"#ff4444":d.risk==="MEDIUM"?"#ffcc00":"#00ff80" }}>
                    {d.risk}
                  </p>
                  <p className="text-xs text-green-900 font-mono">{d.label}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-3 text-xs font-mono flex-wrap">
            <span className="flex items-center gap-1.5 text-green-700">
              <span className="w-2 h-2 rounded-full bg-green-500 inline-block"/> State Capital
            </span>
            <span className="flex items-center gap-1.5 text-cyan-700">
              <span className="w-2 h-2 rounded-full bg-cyan-400 inline-block"/> Union Territory
            </span>
            <span className="flex items-center gap-1.5 text-red-600">
              <span className="w-2 h-2 rounded-full bg-red-500 inline-block animate-pulse"/> SOS Active
            </span>
            <span className="flex items-center gap-1.5 text-yellow-700">
              <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block"/> Medium Risk
            </span>
          </div>
          {/* Disaster Zone Legend */}
          <div className="w-full mt-2 pt-2 border-t border-green-900/30 flex flex-wrap gap-3">
            {DISASTER_ZONES.map(z => (
              <span key={z.name} className="flex items-center gap-1 text-xs font-mono"
                style={{ color:`rgba(${z.color},0.85)` }}>
                <span>{z.icon}</span>
                <span>{z.name}</span>
                <span className="opacity-50">· {z.type}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Risk Gauge ────────────────────────────────────────────
function RiskGauge({ score=0, level="LOW" }) {
  const color = RISK_COLOR[level] || "#22c55e";
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-24 h-24">
        <svg viewBox="0 0 36 36" className="w-24 h-24 -rotate-90">
          <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e5e7eb" strokeWidth="3"/>
          <circle cx="18" cy="18" r="15.9" fill="none" stroke={color} strokeWidth="3"
            strokeDasharray={`${Math.min(score,100)} 100`} strokeLinecap="round"
            className="transition-all duration-700"/>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold" style={{ color }}>{score}</span>
          <span className="text-xs text-gray-400">/100</span>
        </div>
      </div>
      <span className="text-xs font-semibold mt-1" style={{ color }}>{level}</span>
    </div>
  );
}

// ── Prediction Trend ──────────────────────────────────────
function PredictionTrend({ history }) {
  if (!history.length) return null;
  const COLORS = { flood:"#3b82f6", earthquake:"#f59e0b", heatwave:"#ef4444", air_quality:"#8b5cf6" };
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
      <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">📈 Prediction Trend</h3>
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={history}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
          <XAxis dataKey="time" tick={{ fontSize:10 }}/>
          <YAxis domain={[0,100]} tick={{ fontSize:10 }}/>
          <Tooltip formatter={(v,n) => [`${v}/100`,n]}/>
          {Object.keys(COLORS).map(k => (
            <Area key={k} type="monotone" dataKey={k} stroke={COLORS[k]}
              fill={COLORS[k]} fillOpacity={0.1} strokeWidth={2} dot={false} name={DISASTER_LABELS[k]}/>
          ))}
        </AreaChart>
      </ResponsiveContainer>
      <div className="flex gap-4 mt-2 flex-wrap">
        {Object.entries(COLORS).map(([k,c]) => (
          <span key={k} className="flex items-center gap-1 text-xs text-gray-500">
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor:c }}/>
            {DISASTER_LABELS[k]}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Disaster Predictions ──────────────────────────────────
function DisasterPredictions({ onHistory, sosSignals=[] }) {
  const [predictions, setPredictions] = useState(null);
  const [overallRisk, setOverallRisk] = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [weather,     setWeather]     = useState(null);

  const runFetch = useCallback(async () => {
    setLoading(true);
    try {
      const wRes = await axios.get(`${BASE}/weather/Ludhiana`);
      const w    = wRes.data;
      setWeather(w);
      const inputs = {
        temperature_c:w.temperature??30, humidity_pct:w.humidity??65,
        wind_speed_kmh:w.wind_speed??12, rainfall_mm:w.rainfall??0,
        consecutive_rain_days:1, rainfall_7day_sum:(w.rainfall??0)*5,
        humidity_7day_avg:w.humidity??65, seismic_activity:0.5,
        ground_vibration:0.2, historical_quakes_5yr:1, fault_distance_km:100,
        depth_km:30, foreshock_count:0, heat_index:w.temperature??32,
        consecutive_hot_days:(w.temperature??0)>38?3:0,
        temp_7day_avg:w.temperature??29, temp_max_7day:(w.temperature??30)+3,
        pm2_5:45, pm10:80, aqi:75, wind_7day_avg:w.wind_speed??11,
      };
      const res   = await axios.post(`${BASE}/predict/all`, inputs);
      const preds = res.data.predictions;
      setPredictions(preds);
      setOverallRisk(res.data.overall_highest_risk);
      onHistory({
        time: new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),
        flood:       RISK_SCORE[preds.flood?.risk_level]??20,
        earthquake:  RISK_SCORE[preds.earthquake?.risk_level]??20,
        heatwave:    RISK_SCORE[preds.heatwave?.risk_level]??20,
        air_quality: RISK_SCORE[preds.air_quality?.risk_level]??20,
      });
    } catch {}
    finally { setLoading(false); }
  }, [onHistory]);

  useEffect(() => { runFetch(); }, [runFetch]);

  return (
    <div className="space-y-4 mb-6">
      <AnimatedRadar predictions={predictions} sosSignals={sosSignals}/>

      {!loading && predictions && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
          <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
            <div>
              <h2 className="font-bold text-gray-800 dark:text-gray-100 text-base">🤖 AI Disaster Predictions</h2>
              {weather && (
                <p className="text-xs text-gray-400 mt-0.5">
                  Live weather · {weather.temperature}°C · {weather.humidity}% humidity · {weather.rainfall}mm rain
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {overallRisk && (
                <span className={`text-xs font-bold px-3 py-1 rounded-full border ${RISK_STYLES[overallRisk]}`}>
                  Overall: {overallRisk}
                </span>
              )}
              <button onClick={runFetch} className="text-xs text-blue-500 hover:underline">🔄 Refresh</button>
            </div>
          </div>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            {Object.entries(predictions).map(([type,data]) => {
              const risk = data?.risk_level || "LOW";
              return (
                <div key={type} className={`rounded-lg border p-3 ${RISK_STYLES[risk]}`}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-lg">{DISASTER_ICONS[type]}</span>
                    <span className="text-xs font-bold">{risk}</span>
                  </div>
                  <p className="text-sm font-semibold">{DISASTER_LABELS[type]}</p>
                  <p className="text-xs mt-1 opacity-75">{data?.probability}% confidence</p>
                  {["LOW","MEDIUM","HIGH"].map(level => (
                    <div key={level} className="mt-1">
                      <div className="flex justify-between text-xs opacity-60 mb-0.5">
                        <span>{level}</span><span>{data?.all_probabilities?.[level]||0}%</span>
                      </div>
                      <div className="bg-white bg-opacity-50 rounded h-1">
                        <div className={`h-1 rounded transition-all duration-700 ${
                          level==="HIGH"?"bg-red-500":level==="MEDIUM"?"bg-yellow-500":"bg-green-500"
                        }`} style={{ width:`${data?.all_probabilities?.[level]||0}%` }}/>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {loading && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 p-5 animate-pulse">
          <div className="h-4 w-48 bg-gray-200 rounded mb-4"/>
          <div className="grid grid-cols-4 gap-3">
            {[...Array(4)].map((_,i) => <div key={i} className="h-28 bg-gray-200 rounded-lg"/>)}
          </div>
        </div>
      )}
    </div>
  );
}

// ── MapView Wrapper — fixes Leaflet blank on tab switch ───
function MapViewWrapper({ signals }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 50);
    return () => clearTimeout(t);
  }, []);

  if (!ready) return (
    <div className="flex items-center justify-center h-96 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
      <div className="text-center">
        <p className="text-3xl mb-2 animate-spin">🗺️</p>
        <p className="text-gray-400 text-sm">Loading map...</p>
      </div>
    </div>
  );

  return <MapView signals={signals}/>;
}

// ── Main Dashboard ────────────────────────────────────────
export default function Dashboard() {
  const [signals,      setSignals]      = useState([]);
  const [stats,        setStats]        = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [tab,          setTab]          = useState("feed");
  const [activeCount,  setActiveCount]  = useState(0);
  const [wsStatus,     setWsStatus]     = useState("offline");
  const [predHistory,  setPredHistory]  = useState([]);

  const addHistory = useCallback((point) => {
    setPredHistory(prev => [...prev.slice(-19), point]);
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const res = await getDashboard();
      setStats(res.data);
    } catch {
      toast.error("Cannot connect to backend");
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30_000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  const fetchSignals = useCallback(async () => {
    try {
      const res = await axios.get(`${BASE}/sos/all`);
      const active = res.data.signals?.filter(s => s.status === "ACTIVE") ?? [];
      setSignals(prev => {
        const byId = new Map(prev.map(s => [s.id, s]));
        active.forEach(s => byId.set(s.id, s));
        return Array.from(byId.values());
      });
    } catch {}
  }, []);

  useEffect(() => {
    fetchSignals();
    const interval = setInterval(fetchSignals, 10_000);
    return () => clearInterval(interval);
  }, [fetchSignals]);

  const wsColor = { connected:"text-green-500", reconnecting:"text-yellow-500", offline:"text-red-400" }[wsStatus];
  const wsLabel = { connected:"● Live", reconnecting:"⟳ Reconnecting", offline:"✕ Offline" }[wsStatus];

  if (statsLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
      <div className="text-center">
        <p className="text-4xl mb-3 animate-bounce">🛡️</p>
        <p className="text-gray-500 dark:text-gray-400 text-lg">Loading SAHAAY Dashboard...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex justify-between items-center shadow-sm mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">🛡️ SAHAAY</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Admin Rescue Dashboard</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap justify-end">
          {activeCount > 0 && (
            <span className="bg-red-500 text-white text-xs font-bold px-3 py-1 rounded-full animate-pulse">
              🆘 {activeCount} Active SOS
            </span>
          )}
          <span className={`text-xs font-medium ${wsColor}`}>{wsLabel}</span>
          <button onClick={fetchStats}
            className="bg-blue-500 hover:bg-blue-600 text-white text-sm px-4 py-2 rounded-lg transition">
            🔄 Refresh
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6">
        <div className="flex gap-4 mb-6 items-start">
          <div className="flex-1">
            <RiskBanner risk={stats?.current_risk} reasons={stats?.risk_reasons}/>
          </div>
          {stats?.risk_score !== undefined && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm flex flex-col items-center">
              <p className="text-xs text-gray-500 mb-2">Risk Score</p>
              <RiskGauge score={stats.risk_score} level={stats.current_risk}/>
            </div>
          )}
        </div>

        <StatsPanel stats={stats}/>
        <DisasterPredictions onHistory={addHistory} sosSignals={signals}/>

        {predHistory.length > 1 && (
          <div className="mb-6">
            <PredictionTrend history={predHistory}/>
          </div>
        )}

        <div className="flex gap-2 mb-4">
          {[["feed",`🆘 SOS Feed (${activeCount})`],["map","🗺️ Live Map"]].map(([id,label]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                tab===id
                  ? "bg-blue-500 text-white"
                  : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700"
              }`}>
              {label}
            </button>
          ))}
        </div>

        {tab==="feed" && (
          <SOSFeed
            onRefresh={fetchStats}
            onActiveCountChange={setActiveCount}
            onWsStatusChange={setWsStatus}
            onSignalsChange={(incoming) => {
              setSignals(prev => {
                const byId = new Map(prev.map(s => [s.id, s]));
                incoming.forEach(s => byId.set(s.id, s));
                return Array.from(byId.values());
              });
            }}
          />
        )}
        {tab==="map" && <MapViewWrapper signals={signals}/>}
      </div>
    </div>
  );
}