import { useEffect, useState } from "react";
import { getBackendMode, subscribeBackendMode } from "./api/client.js";
import Dashboard from "./pages/Dashboard.jsx";

export default function App() {
  const [backendMode, setBackendMode] = useState(getBackendMode());

  useEffect(() => {
    const unsubscribe = subscribeBackendMode(setBackendMode);
    return unsubscribe;
  }, []);

  const statusLabel =
    backendMode === "backend"
      ? "backend connected"
      : backendMode === "fallback"
        ? "fallback mode"
        : "checking backend";

  const statusClass =
    backendMode === "backend"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : backendMode === "fallback"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-slate-200 bg-slate-50 text-slate-600";

  return (
    <div className="min-h-screen">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-xl font-semibold">Playto Pay</h1>
            <p className="text-sm text-slate-500">Payout engine dashboard</p>
          </div>
          <div className="text-sm">
            <span className={`rounded border px-2 py-1 ${statusClass}`}>
              {statusLabel}
            </span>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-6">
        <Dashboard />
      </main>
    </div>
  );
}
