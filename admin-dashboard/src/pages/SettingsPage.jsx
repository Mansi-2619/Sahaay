import { useState } from "react";
import { useTheme } from "../context/ThemeContext";
import toast from "react-hot-toast";

export default function SettingsPage() {
  const { dark, toggle } = useTheme();
  const [profile, setProfile] = useState({
    name:  localStorage.getItem("admin_name")  || "Admin User",
    email: localStorage.getItem("admin_email") || "admin@sahaay.gov.in",
    phone: localStorage.getItem("admin_phone") || "+91 98765 43210",
    city:  localStorage.getItem("admin_city")  || "Ludhiana",
  });
  const [passwords, setPasswords] = useState({ current: "", new: "", confirm: "" });
  const [saved, setSaved] = useState(false);

  const saveProfile = () => {
    Object.entries(profile).forEach(([k, v]) => localStorage.setItem(`admin_${k}`, v));
    toast.success("Profile saved!");
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const changePassword = () => {
    if (passwords.current !== "sahaay123") {
      toast.error("Current password is incorrect"); return;
    }
    if (passwords.new.length < 6) {
      toast.error("New password must be at least 6 characters"); return;
    }
    if (passwords.new !== passwords.confirm) {
      toast.error("Passwords do not match"); return;
    }
    toast.success("Password updated!");
    setPasswords({ current: "", new: "", confirm: "" });
  };

  const inputCls = "w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2.5 text-sm bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500";
  const labelCls = "block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1";
  const cardCls  = "bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm mb-6";

  return (
    <div className="max-w-2xl">
      <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-6">⚙️ Settings</h2>

      {/* Profile */}
      <div className={cardCls}>
        <h3 className="font-bold text-gray-800 dark:text-white mb-4">👤 Admin Profile</h3>
        <div className="grid grid-cols-2 gap-4">
          {[["name","Full Name"],["email","Email"],["phone","Phone"],["city","City"]].map(([key, label]) => (
            <div key={key}>
              <label className={labelCls}>{label}</label>
              <input value={profile[key]}
                onChange={e => setProfile(p => ({ ...p, [key]: e.target.value }))}
                className={inputCls} />
            </div>
          ))}
        </div>
        <button onClick={saveProfile}
          className="mt-4 bg-blue-500 hover:bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium transition">
          {saved ? "✅ Saved!" : "💾 Save Profile"}
        </button>
      </div>

      {/* Appearance */}
      <div className={cardCls}>
        <h3 className="font-bold text-gray-800 dark:text-white mb-4">🎨 Appearance</h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Dark Mode</p>
            <p className="text-xs text-gray-400">Switch between light and dark theme</p>
          </div>
          <button onClick={toggle}
            className={`relative w-12 h-6 rounded-full transition-colors ${dark ? "bg-blue-500" : "bg-gray-300"}`}>
            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${dark ? "translate-x-7" : "translate-x-1"}`} />
          </button>
        </div>
      </div>

      {/* Change Password */}
      <div className={cardCls}>
        <h3 className="font-bold text-gray-800 dark:text-white mb-4">🔒 Change Password</h3>
        <div className="space-y-3">
          {[["current","Current Password"],["new","New Password"],["confirm","Confirm Password"]].map(([key, label]) => (
            <div key={key}>
              <label className={labelCls}>{label}</label>
              <input type="password" value={passwords[key]}
                onChange={e => setPasswords(p => ({ ...p, [key]: e.target.value }))}
                placeholder={`Enter ${label.toLowerCase()}`}
                className={inputCls} />
            </div>
          ))}
        </div>
        <button onClick={changePassword}
          className="mt-4 bg-gray-800 dark:bg-gray-700 hover:bg-gray-900 text-white px-5 py-2 rounded-lg text-sm font-medium transition">
          🔑 Update Password
        </button>
      </div>

      {/* System Info */}
      <div className={cardCls}>
        <h3 className="font-bold text-gray-800 dark:text-white mb-4">ℹ️ System Info</h3>
        <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
          <div className="flex justify-between"><span>Version</span><span className="font-medium">SAHAAY v1.0</span></div>
          <div className="flex justify-between"><span>Backend</span><span className="font-medium text-green-500">● Connected</span></div>
          <div className="flex justify-between"><span>ML Model</span><span className="font-medium text-green-500">● Active</span></div>
          <div className="flex justify-between"><span>Last Login</span><span className="font-medium">{new Date().toLocaleDateString()}</span></div>
        </div>
      </div>
    </div>
  );
}