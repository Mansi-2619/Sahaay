/**
 * api.js  –  Sahaay API Client v3.0
 * Auto-retry, TTL cache, WebSocket with auto-reconnect, env-based URL
 */

import axios from "axios";

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
const WS_URL   = BASE_URL.replace(/^http/, "ws");

// ── Axios instance ────────────────────────────────────────
export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15_000,
  headers: { "Content-Type": "application/json" },
});

// Inject auth token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("sahaay_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-retry on 5xx with exponential back-off
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const config = err.config || {};
    config._retries = config._retries ?? 0;
    const status  = err.response?.status;

    if (config._retries < 2 && (!status || status >= 500)) {
      config._retries += 1;
      await new Promise((r) => setTimeout(r, 600 * 2 ** (config._retries - 1)));
      return api(config);
    }

    return Promise.reject({
      status,
      message: err.response?.data?.detail || err.response?.data?.message || err.message,
      raw: err,
    });
  }
);

// ── GET cache ─────────────────────────────────────────────
const _cache = new Map();

function getCached(key) {
  const e = _cache.get(key);
  if (!e || Date.now() > e.exp) { _cache.delete(key); return null; }
  return e.data;
}
function setCached(key, data, ttl = 300_000) {
  _cache.set(key, { data, exp: Date.now() + ttl });
}
export function invalidateCache(prefix = "") {
  for (const key of _cache.keys()) if (key.startsWith(prefix)) _cache.delete(key);
}

async function cachedGet(url, ttl = 300_000, signal) {
  const hit = getCached(url);
  if (hit) return { data: hit };
  const res = await api.get(url, { signal });
  setCached(url, res.data, ttl);
  return res;
}

// ── WebSocket with auto-reconnect ─────────────────────────
/**
 * Usage:
 *   const ws = createSOSSocket({
 *     onSnapshot: (signals) => ...,
 *     onNewSOS:   (signal)  => ...,
 *     onResolve:  (id)      => ...,
 *     onAlert:    (alert)   => ...,
 *   });
 *   ws.close(); // cleanup
 */
export function createSOSSocket({ onSnapshot, onNewSOS, onResolve, onAlert,
                                   onConnect, onDisconnect } = {}) {
  let socket, timer, closed = false, attempt = 0;

  function connect() {
    if (closed) return;
    socket = new WebSocket(`${WS_URL}/ws/sos`);

    socket.onopen    = () => { attempt = 0; onConnect?.(); };
    socket.onmessage = ({ data }) => {
      let msg;
      try { msg = JSON.parse(data); } catch { return; }
      if (msg.type === "snapshot")    onSnapshot?.(msg.signals);
      if (msg.type === "new_sos")     onNewSOS?.(msg.signal);
      if (msg.type === "resolve_sos") onResolve?.(msg.sos_id);
      if (msg.type === "new_alert")   onAlert?.(msg.alert);
    };
    socket.onerror   = (e) => console.warn("[WS] error", e);
    socket.onclose   = () => {
      onDisconnect?.();
      if (closed) return;
      timer = setTimeout(connect, Math.min(1000 * 2 ** attempt++, 30_000));
    };
  }

  connect();
  return {
    ping:        () => socket?.readyState === WebSocket.OPEN && socket.send("ping"),
    close:       () => { closed = true; clearTimeout(timer); socket?.close(); },
    get isAlive()  { return socket?.readyState === WebSocket.OPEN; },
  };
}

// ── Endpoints ─────────────────────────────────────────────

// General
export const getHealth    = ()             => api.get("/health");
export const getDashboard = (signal)       => cachedGet("/dashboard", 120_000, signal);

// Weather & Prediction
export const getWeather = (city, signal)   => cachedGet(`/weather/${city}`, 300_000, signal);
export const getPredict = (city, signal)   => cachedGet(`/predict/${city}`, 300_000, signal);

// SOS
export const getAllSOS          = (signal) => api.get("/sos/all", { signal });
export const submitSOS          = (data)   => api.post("/sos", data);
export const resolveSOS         = (id)     => api.put(`/sos/${id}/resolve`);
export const updateSOSLocation  = (id, lat, lng) =>
  api.put(`/sos/${id}/location`, null, { params: { lat, lng } });
export const uploadSOSMedia     = (id, files) => {
  const form = new FormData();
  Array.from(files).forEach((f) => form.append("files", f));
  return api.post(`/sos/${id}/media`, form, { headers: { "Content-Type": "multipart/form-data" } });
};

// Alerts
export const getAlerts    = (limit = 50, signal) => api.get("/alerts", { params: { limit }, signal });
export const createAlert  = (data) => {
  invalidateCache("/dashboard");
  return api.post("/alerts", data);
};

// Monitor
export const getMonitor   = (signal)             => api.get("/monitor", { signal });
export const getCityTrend = (city, limit = 24, signal) =>
  api.get(`/monitor/${city}/trend`, { params: { limit }, signal });

// Shelters
export const getShelters  = (lat, lng, radius = 10000, signal) =>
  cachedGet(`/shelters?lat=${lat}&lng=${lng}&radius=${radius}`, 1_800_000, signal);

// Contacts
export const getContacts   = (signal)      => api.get("/contacts", { signal });
export const createContact = (data)        => api.post("/contacts", data);
export const updateContact = (id, data)    => api.put(`/contacts/${id}`, data);
export const deleteContact = (id)          => api.delete(`/contacts/${id}`);
export const sendSMS       = (numbers, message) => api.post("/contacts/sms",  { numbers, message });
export const triggerIVR    = (numbers, message) => api.post("/contacts/ivr",  { numbers, message });