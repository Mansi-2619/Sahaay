import { useState } from "react";
import axios from "axios";

const BASE = "http://localhost:8000";

export default function CitizenSOS() {
  const [step,    setStep]    = useState(1);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const [form,    setForm]    = useState({
    name: "", location: "", people_count: 1, message: "",
  });
  const [coords, setCoords] = useState(null);
  const [files,  setFiles]  = useState([]);
  const [sosId,  setSosId]  = useState(null);

  const getLocation = () => new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject("Geolocation not supported");
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      ()    => reject("Location denied")
    );
  });

  const handleSubmit = async () => {
    if (!form.name.trim())     return setError("Please enter your name");
    if (!form.location.trim()) return setError("Please enter your location description");

    setError("");
    setLoading(true);
    setStep(2);

    try {
      let lat = 30.9010, lng = 75.8573;
      try {
        const pos = await getLocation();
        lat = pos.lat;
        lng = pos.lng;
        setCoords({ lat, lng });
      } catch {
        // use fallback coords silently
      }

      const res = await axios.post(`${BASE}/sos`, {
        name:         form.name,
        location:     form.location,
        latitude:     lat,
        longitude:    lng,
        people_count: Number(form.people_count),
        message:      form.message,
      });

      const id = res.data.sos?.id;
      setSosId(id);

      if (files.length > 0 && id) {
        const fd = new FormData();
        files.forEach(f => fd.append("files", f));
        await axios.post(`${BASE}/sos/${id}/media`, fd);
      }

      setStep(3);
    } catch (e) {
      console.error("SOS Error:", e.response?.data);
      setError("Failed to send SOS. Please try again.");
      setStep(1);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setStep(1);
    setForm({ name: "", location: "", people_count: 1, message: "" });
    setFiles([]);
    setCoords(null);
    setSosId(null);
    setError("");
  };

  // ── Step 3: Success ──
  if (step === 3) return (
    <div className="min-h-screen bg-red-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
        <div className="text-6xl mb-4">✅</div>
        <h1 className="text-2xl font-bold text-green-600 mb-2">SOS Sent!</h1>
        <p className="text-gray-600 mb-2">Your emergency signal has been received by the rescue team.</p>
        <p className="text-gray-400 text-sm mb-1">Help is on the way.</p>
        {sosId && <p className="text-xs text-gray-400 mb-6">Signal ID: #{sosId}</p>}
        {coords && (
          <p className="text-xs text-green-500 mb-6">
            📍 Location captured: {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}
          </p>
        )}
        <div className="space-y-3">
          <a href="tel:112"
            className="block bg-red-500 hover:bg-red-600 text-white font-bold py-3 rounded-xl transition">
            📞 Call Emergency: 112
          </a>
          <button onClick={reset}
            className="block w-full bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 rounded-xl transition text-sm">
            Send Another SOS
          </button>
        </div>
      </div>
    </div>
  );

  // ── Step 2: Locating ──
  if (step === 2) return (
    <div className="min-h-screen bg-red-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
        <div className="text-5xl mb-4 animate-bounce">📡</div>
        <h1 className="text-xl font-bold text-gray-800 mb-2">Sending SOS...</h1>
        <p className="text-gray-500 text-sm">Getting your location and alerting rescue teams</p>
        <div className="mt-6 flex justify-center">
          <div className="w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    </div>
  );

  // ── Step 1: Form ──
  return (
    <div className="min-h-screen bg-red-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">

        <div className="bg-red-500 rounded-t-2xl px-6 py-5 text-center">
          <div className="text-4xl mb-1">🆘</div>
          <h1 className="text-2xl font-bold text-white">Emergency SOS</h1>
          <p className="text-red-100 text-sm mt-1">SAHAAY Rescue System</p>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-lg">
              ⚠️ {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Your Name *</label>
            <input type="text" value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Enter your full name"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Your Location *</label>
            <input type="text" value={form.location}
              onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
              placeholder="e.g. Near City Hospital, Model Town"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
            />
            <p className="text-xs text-gray-400 mt-1">GPS will also be captured automatically</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Number of People in Danger</label>
            <div className="flex items-center gap-3">
              <button onClick={() => setForm(f => ({ ...f, people_count: Math.max(1, f.people_count - 1) }))}
                className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 text-lg font-bold transition">−</button>
              <span className="text-2xl font-bold text-red-500 w-8 text-center">{form.people_count}</span>
              <button onClick={() => setForm(f => ({ ...f, people_count: f.people_count + 1 }))}
                className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 text-lg font-bold transition">+</button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Emergency Details</label>
            <textarea value={form.message}
              onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
              placeholder="Describe your emergency (flood, fire, injured, trapped...)"
              rows={3}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Attach Photos/Videos (optional)</label>
            <label className="flex items-center gap-2 border-2 border-dashed border-gray-200 rounded-xl px-4 py-3 cursor-pointer hover:border-red-300 transition">
              <span className="text-xl">📎</span>
              <span className="text-sm text-gray-500">
                {files.length > 0 ? `${files.length} file(s) selected` : "Tap to attach"}
              </span>
              <input type="file" multiple accept="image/*,video/*" className="hidden"
                onChange={e => setFiles(Array.from(e.target.files))} />
            </label>
          </div>

          <button onClick={handleSubmit} disabled={loading}
            className="w-full bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white font-bold py-4 rounded-xl text-lg transition animate-pulse">
            🆘 SEND SOS NOW
          </button>

          <p className="text-center text-xs text-gray-400">
            Your signal will immediately alert the rescue team
          </p>
        </div>
      </div>
    </div>
  );
}