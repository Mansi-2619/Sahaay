import { useState, useEffect } from "react";
import axios from "axios";

const API = "http://localhost:8000";

const ZONES = ["Ludhiana", "Chandigarh", "Amritsar", "Jalandhar", "Patiala"];
const TYPES = ["Rescue Team", "Citizen", "Official", "Medical", "Police"];

export default function ContactBook() {
  const [contacts, setContacts]       = useState([]);
  const [filtered, setFiltered]       = useState([]);
  const [selected, setSelected]       = useState([]);
  const [search, setSearch]           = useState("");
  const [filterZone, setFilterZone]   = useState("All");
  const [filterType, setFilterType]   = useState("All");
  const [showForm, setShowForm]       = useState(false);
  const [editContact, setEditContact] = useState(null);
  const [smsMsg, setSmsMsg]           = useState("");
  const [showSMS, setShowSMS]         = useState(false);
  const [showIVR, setShowIVR]         = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", zone: ZONES[0], contact_type: TYPES[0] });

  useEffect(() => { fetchContacts(); }, []);

  useEffect(() => {
    let result = contacts;
    if (filterZone !== "All") result = result.filter(c => c.zone === filterZone);
    if (filterType !== "All") result = result.filter(c => c.type === filterType);
    if (search) result = result.filter(c =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.includes(search)
    );
    setFiltered(result);
  }, [contacts, filterZone, filterType, search]);

  const fetchContacts = async () => {
    const res = await axios.get(`${API}/contacts`);
    setContacts(res.data.contacts);
  };

  const handleSubmit = async () => {
    if (!form.name || !form.phone) return alert("Name and phone required");
    if (editContact) {
      await axios.put(`${API}/contacts/${editContact._id}`, form);
    } else {
      await axios.post(`${API}/contacts`, form);
    }
    setShowForm(false);
    setEditContact(null);
    setForm({ name: "", phone: "", zone: ZONES[0], contact_type: TYPES[0] });
    fetchContacts();
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this contact?")) return;
    await axios.delete(`${API}/contacts/${id}`);
    fetchContacts();
  };

  const handleEdit = (contact) => {
    setEditContact(contact);
    setForm({ name: contact.name, phone: contact.phone, zone: contact.zone, contact_type: contact.type });
    setShowForm(true);
  };

  const toggleSelect = (id) => {
    setSelected(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const selectAll = () => {
    if (selected.length === filtered.length) setSelected([]);
    else setSelected(filtered.map(c => c._id));
  };

  const selectedNumbers = contacts.filter(c => selected.includes(c._id)).map(c => c.phone);

  const sendSMS = async () => {
    if (!smsMsg) return alert("Enter a message");
    const res = await axios.post(`${API}/contacts/sms`, { numbers: selectedNumbers, message: smsMsg });
    alert(`SMS queued for ${res.data.sent_to.length} contacts.\nNote: ${res.data.note}`);
    setShowSMS(false);
    setSmsMsg("");
  };

  const triggerIVR = async () => {
    if (!smsMsg) return alert("Enter a message");
    const res = await axios.post(`${API}/contacts/ivr`, { numbers: selectedNumbers, message: smsMsg });
    alert(`IVR call queued for ${res.data.called.length} contacts.\nNote: ${res.data.note}`);
    setShowIVR(false);
    setSmsMsg("");
  };

  const typeColor = (type) => {
    const colors = {
      "Rescue Team": "bg-blue-100 text-blue-700",
      "Citizen":     "bg-gray-100 text-gray-700",
      "Official":    "bg-purple-100 text-purple-700",
      "Medical":     "bg-green-100 text-green-700",
      "Police":      "bg-yellow-100 text-yellow-700",
    };
    return colors[type] || "bg-gray-100 text-gray-600";
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-800 mb-1">📒 Contact Book</h1>
      <p className="text-gray-500 mb-5">Manage contacts for SMS alerts and IVR calls</p>

      {/* Top Bar */}
      <div className="flex flex-wrap gap-3 mb-4 items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          <input
            className="border rounded-lg px-3 py-2 text-sm w-48"
            placeholder="🔍 Search name or number..."
            value={search} onChange={e => setSearch(e.target.value)}
          />
          <select className="border rounded-lg px-3 py-2 text-sm" value={filterZone} onChange={e => setFilterZone(e.target.value)}>
            <option>All</option>
            {ZONES.map(z => <option key={z}>{z}</option>)}
          </select>
          <select className="border rounded-lg px-3 py-2 text-sm" value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option>All</option>
            {TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <button onClick={() => { setShowForm(true); setEditContact(null); setForm({ name: "", phone: "", zone: ZONES[0], contact_type: TYPES[0] }); }}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
          + Add Contact
        </button>
      </div>

      {/* Bulk Actions */}
      {selected.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-4 flex gap-3 items-center">
          <span className="text-sm text-blue-700 font-medium">{selected.length} selected</span>
          <button onClick={() => setShowSMS(true)} className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700">📱 Send SMS</button>
          <button onClick={() => setShowIVR(true)} className="bg-orange-500 text-white px-3 py-1 rounded text-sm hover:bg-orange-600">📞 IVR Call</button>
          <button onClick={() => setSelected([])} className="text-gray-500 text-sm ml-auto hover:text-gray-700">✕ Clear</button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
            <tr>
              <th className="px-4 py-3 text-left">
                <input type="checkbox" onChange={selectAll} checked={selected.length === filtered.length && filtered.length > 0} />
              </th>
              <th className="px-4 py-3 text-left">Name</th>
              <th className="px-4 py-3 text-left">Phone</th>
              <th className="px-4 py-3 text-left">Zone</th>
              <th className="px-4 py-3 text-left">Type</th>
              <th className="px-4 py-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-12 text-gray-400">No contacts found</td></tr>
            ) : filtered.map(c => (
              <tr key={c._id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <input type="checkbox" checked={selected.includes(c._id)} onChange={() => toggleSelect(c._id)} />
                </td>
                <td className="px-4 py-3 font-medium text-gray-800">{c.name}</td>
                <td className="px-4 py-3 text-gray-600">{c.phone}</td>
                <td className="px-4 py-3 text-gray-600">{c.zone}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${typeColor(c.type)}`}>{c.type}</span>
                </td>
                <td className="px-4 py-3 flex gap-2">
                  <button onClick={() => handleEdit(c)} className="text-blue-600 hover:underline text-xs">Edit</button>
                  <button onClick={() => handleDelete(c._id)} className="text-red-500 hover:underline text-xs">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-96 shadow-xl">
            <h2 className="text-lg font-bold mb-4">{editContact ? "Edit Contact" : "Add Contact"}</h2>
            <div className="flex flex-col gap-3">
              <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Full Name" value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
              <input className="border rounded-lg px-3 py-2 text-sm" placeholder="+91XXXXXXXXXX" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} />
              <select className="border rounded-lg px-3 py-2 text-sm" value={form.zone} onChange={e => setForm({...form, zone: e.target.value})}>
                {ZONES.map(z => <option key={z}>{z}</option>)}
              </select>
              <select className="border rounded-lg px-3 py-2 text-sm" value={form.contact_type} onChange={e => setForm({...form, contact_type: e.target.value})}>
                {TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="flex gap-2 mt-4 justify-end">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-600 border rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={handleSubmit} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                {editContact ? "Update" : "Add"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SMS Modal */}
      {showSMS && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-96 shadow-xl">
            <h2 className="text-lg font-bold mb-2">📱 Send SMS</h2>
            <p className="text-sm text-gray-500 mb-3">Sending to {selected.length} contacts</p>
            <textarea className="border rounded-lg px-3 py-2 text-sm w-full h-28 resize-none" placeholder="Type your alert message..." value={smsMsg} onChange={e => setSmsMsg(e.target.value)} />
            <div className="flex gap-2 mt-3 justify-end">
              <button onClick={() => setShowSMS(false)} className="px-4 py-2 text-sm text-gray-600 border rounded-lg">Cancel</button>
              <button onClick={sendSMS} className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700">Send SMS</button>
            </div>
          </div>
        </div>
      )}

      {/* IVR Modal */}
      {showIVR && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-96 shadow-xl">
            <h2 className="text-lg font-bold mb-2">📞 IVR Call</h2>
            <p className="text-sm text-gray-500 mb-3">Calling {selected.length} contacts</p>
            <textarea className="border rounded-lg px-3 py-2 text-sm w-full h-28 resize-none" placeholder="Message to be spoken in the call..." value={smsMsg} onChange={e => setSmsMsg(e.target.value)} />
            <div className="flex gap-2 mt-3 justify-end">
              <button onClick={() => setShowIVR(false)} className="px-4 py-2 text-sm text-gray-600 border rounded-lg">Cancel</button>
              <button onClick={triggerIVR} className="px-4 py-2 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600">Start IVR Call</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}