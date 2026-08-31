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
      ? "border-emerald-700 bg-emerald-950 text-emerald-300"
      : backendMode === "fallback"
        ? "border-amber-700 bg-amber-950 text-amber-300"
        : "border-neutral-700 bg-neutral-900 text-neutral-400";

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="border-b border-neutral-800 bg-neutral-900">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-neutral-50">
              Playto Pay
            </h1>
            <p className="text-sm text-neutral-400">Payout engine dashboard</p>
          </div>
          <div className="text-sm">
            <span
              className={`rounded border px-2.5 py-1 font-mono text-xs uppercase tracking-wide ${statusClass}`}
            >
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
