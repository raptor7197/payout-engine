import Dashboard from "./pages/Dashboard.jsx";

export default function App() {
  return (
    <div className="min-h-screen">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-xl font-semibold">Playto Pay</h1>
            <p className="text-sm text-slate-500">Payout engine dashboard</p>
          </div>
          <div className="text-sm text-slate-500">
            <span>Merchant ID from </span>
            <code className="rounded bg-slate-100 px-2 py-1">VITE_MERCHANT_ID</code>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-6">
        <Dashboard />
      </main>
    </div>
  );
}
