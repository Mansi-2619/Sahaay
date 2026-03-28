import { useState } from "react";
import toast        from "react-hot-toast";
import axios        from "axios";

const BASE     = import.meta.env.VITE_API_URL || "http://localhost:8000";
const CHANNELS = ["App Notification", "SMS", "WhatsApp", "IVR Call"];
const ZONES    = ["Ludhiana", "Chandigarh", "Amritsar", "Jalandhar", "Patiala"];
const TYPES    = ["Flood", "Heatwave", "Landslide", "Storm", "Earthquake"];

export default function AlertPage() {
  const [form, setForm] = useState({ zone:"Ludhiana", type:"Flood", severity:"HIGH", message:"", channels:["App Notification"] });
  const [sending, setSending] = useState(false);
  const [sent,    setSent]    = useState(false);

  const toggleChannel = (ch) => {
    setForm((f) => ({ ...f, channels: f.channels.includes(ch) ? f.channels.filter((c) => c !== ch) : [...f.channels, ch] }));
  };

  const handleSend = async () => {
    if (!form.message.trim()) { toast.error("Please enter an alert message"); return; }
    if (form.channels.length === 0) { toast.error("Select at least one channel"); return; }
    setSending(true);
    try {
      await axios.post(`${BASE}/alerts`, form);
      const alertMessage = `SAHAAY ALERT - ${form.zone} | ${form.type} | ${form.severity} | ${form.message} | Helpline: 1078`;
      const contactsRes = await axios.get(`${BASE}/contacts`);
      const numbers = contactsRes.data.contacts.filter((c) => c.zone === form.zone).map((c) => c.phone);
      if (numbers.length === 0) { toast("No contacts found - alert saved to app only"); setSent(true); return; }
      if (form.channels.includes("SMS")) { await axios.post(`${BASE}/contacts/sms`, { numbers, message: alertMessage }); toast.success(`SMS sent`); }
      if (form.channels.includes("IVR Call")) { await axios.post(`${BASE}/contacts/ivr`, { numbers, message: alertMessage }); toast.success(`IVR calls triggered`); }
      if (form.channels.includes("WhatsApp")) { await axios.post(`${BASE}/contacts/sms`, { numbers: numbers.map((n) => `whatsapp:${n}`), message: alertMessage }); toast.success(`WhatsApp sent`); }
      setSent(true);
      toast.success(`Alert broadcast complete`);
    } catch (err) { toast.error("Failed to send alert"); console.error(err); }
    finally { setSending(false); }
  };

  const handleReset = () => { setSent(false); setForm({ zone:"Ludhiana", type:"Flood", severity:"HIGH", message:"", channels:["App Notification"] }); };

  if (sent) return (
    <div className="max-w-lg mx-auto text-center mt-20">
      <p className="text-6xl mb-4">?</p>
      <h2 className="text-2xl font-bold text-gray-800 mb-2">Alert Sent!</h2>
      <p className="text-gray-500 mb-2">Zone: <strong>{form.zone}</strong></p>
      <p className="text-gray-500 mb-6">Channels: <strong>{form.channels.join(", ")}</strong></p>
      <button onClick={handleReset} className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded-lg transition">Send Another Alert</button>
    </div>
  );

  return (
    <div className="max-w-2xl">
      <h2 className="text-2xl font-bold text-gray-800 mb-1">?? Send Alert</h2>
      <p className="text-gray-500 text-sm mb-6">Broadcast emergency alert to affected zones</p>
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">?? Affected Zone</label>
          <select value={form.zone} onChange={(e) => setForm({ ...form, zone: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            {ZONES.map((z) => <option key={z}>{z}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">?? Disaster Type</label>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              {TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">?? Severity</label>
            <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option>LOW</option><option>MEDIUM</option><option>HIGH</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">?? Alert Message</label>
          <textarea rows={3} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="e.g. Heavy flooding expected. Evacuate immediately." className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"/>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">?? Alert Channels</label>
          <div className="grid grid-cols-2 gap-2">
            {CHANNELS.map((ch) => (
              <button key={ch} onClick={() => toggleChannel(ch)} className={`px-3 py-2 rounded-lg text-sm border transition ${form.channels.includes(ch) ? "bg-blue-500 text-white border-blue-500" : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"}`}>{ch}</button>
            ))}
          </div>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600">
          <p className="font-medium text-gray-700 mb-1">?? Preview:</p>
          <p>?? SAHAAY ALERT — {form.zone}</p>
          <p>Type: {form.type} | Severity: {form.severity}</p>
          <p>{form.message || "Your message here..."}</p>
        </div>
        <button onClick={handleSend} disabled={sending} className="w-full bg-red-500 hover:bg-red-600 disabled:bg-gray-300 text-white font-semibold py-3 rounded-lg transition">
          {sending ? "Sending..." : "?? Send Alert Now"}
        </button>
      </div>
    </div>
  );
}
