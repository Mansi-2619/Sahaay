import { NavLink } from "react-router-dom";
import { useTheme } from "../context/ThemeContext";

const links = [
  { to: "/",         icon: "📊", label: "Dashboard"    },
  { to: "/map",      icon: "🗺️", label: "Live Map"     },
  { to: "/sos",      icon: "🆘", label: "SOS Feed"     },
  { to: "/alert",    icon: "📢", label: "Send Alert"   },
  { to: "/monitor",  icon: "🛰️", label: "Monitor"      },
  { to: "/history",  icon: "📋", label: "History"      },
  { to: "/contacts", icon: "📒", label: "Contact Book" },
  { to: "/settings", icon: "⚙️", label: "Settings"     },
  { to: "/news",     icon: "📰", label: "News Feed"    },
];

export default function Sidebar({ onLogout }) {
  const { dark, toggle } = useTheme();

  return (
    <aside className="w-56 min-h-screen bg-gray-900 text-white flex flex-col fixed left-0 top-0">
      <div className="px-6 py-5 border-b border-gray-700">
        <h1 className="text-xl font-bold">🛡️ SAHAAY</h1>
        <p className="text-xs text-gray-400 mt-1">Admin Dashboard</p>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.to === "/"}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition font-medium
               ${isActive ? "bg-blue-600 text-white" : "text-gray-400 hover:bg-gray-800 hover:text-white"}`
            }
          >
            <span>{l.icon}</span>
            <span>{l.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Dark mode toggle */}
      <div className="px-3 py-2">
        <button
          onClick={toggle}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-white px-3 py-2.5 rounded-lg hover:bg-gray-800 transition w-full"
        >
          {dark ? "☀️ Light Mode" : "🌙 Dark Mode"}
        </button>
      </div>

      {/* Logout */}
      <div className="px-3 py-2">
        <button
          onClick={onLogout}
          className="flex items-center gap-2 text-sm text-red-400 hover:text-red-600 px-3 py-2.5 rounded-lg hover:bg-gray-800 transition w-full"
        >
          🚪 Logout
        </button>
      </div>

      <div className="px-6 py-4 border-t border-gray-700">
        <p className="text-xs text-gray-600">SAHAAY v1.0</p>
      </div>
    </aside>
  );
}