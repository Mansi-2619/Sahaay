import { useState, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import Sidebar    from "./components/Sidebar";
import LoginPage  from "./pages/LoginPage";

// Lazy-loaded pages — only downloaded when navigated to
const Dashboard    = lazy(() => import("./pages/Dashboard"));
const SOSPage      = lazy(() => import("./pages/SOSPage"));
const MapPage      = lazy(() => import("./pages/MapPage"));
const AlertPage    = lazy(() => import("./pages/AlertPage"));
const HistoryPage  = lazy(() => import("./pages/HistoryPage"));
const ContactBook  = lazy(() => import("./pages/ContactBook"));
const MonitorPage  = lazy(() => import("./pages/MonitorPage"));
const NewsFeedPage = lazy(() => import("./pages/NewsFeedPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const CitizenSOS   = lazy(() => import("./pages/CitizenSOS"));

// Skeleton shown while a page chunk is loading
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="text-center">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-gray-400 text-sm">Loading...</p>
      </div>
    </div>
  );
}

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(
    () => localStorage.getItem("sahaay_admin") === "true"
  );

  const handleLogin  = () => setIsLoggedIn(true);
  const handleLogout = () => {
    localStorage.removeItem("sahaay_admin");
    setIsLoggedIn(false);
  };

  if (!isLoggedIn) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <BrowserRouter>
      <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Public citizen SOS page — no sidebar */}
          <Route path="/citizen" element={<CitizenSOS />} />

          {/* Admin dashboard — with sidebar */}
          <Route path="/*" element={
            <div className="flex min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
              <Sidebar onLogout={handleLogout} />
              <main className="ml-56 flex-1 min-h-screen bg-gray-50 dark:bg-gray-950 p-6">
                <Routes>
                  <Route path="/"         element={<Dashboard />} />
                  <Route path="/sos"      element={<SOSPage />} />
                  <Route path="/map"      element={<MapPage />} />
                  <Route path="/alert"    element={<AlertPage />} />
                  <Route path="/history"  element={<HistoryPage />} />
                  <Route path="/contacts" element={<ContactBook />} />
                  <Route path="/monitor"  element={<MonitorPage />} />
                  <Route path="/news"     element={<NewsFeedPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="*"         element={<Navigate to="/" replace />} />
                </Routes>
              </main>
            </div>
          } />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}