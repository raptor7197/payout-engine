function statusClasses(status) {
  const s = String(status || "").toLowerCase();
  if (s === "success" || s === "paid" || s === "completed") {
    return "border-emerald-700 bg-emerald-950 text-emerald-300";
  }
  if (s === "failed" || s === "rejected") {
    return "border-red-700 bg-red-950 text-red-300";
  }
  if (s === "pending" || s === "processing" || s === "queued") {
    return "border-amber-700 bg-amber-950 text-amber-300";
  }
  return "border-neutral-700 bg-neutral-900 text-neutral-300";
}

export default function PayoutList({ payouts, loading }) {
  return (
    <section className="flex flex-col rounded-md border border-neutral-800 bg-neutral-900 p-5">
      <header className="mb-4">
        <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-400">
          Payouts
        </h2>
      </header>
      {loading ? (
        <p className="text-sm text-neutral-500">Loading payouts...</p>
      ) : payouts.length === 0 ? (
        <p className="text-sm text-neutral-500">No payouts yet.</p>
      ) : (
        <ul className="space-y-2 overflow-y-auto">
          {payouts.map((payout) => (
            <li
              key={payout.id}
              className="rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono tabular-nums text-neutral-50">
                  ₹{payout.amount_paise / 100}
                </span>
                <span
                  className={`rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${statusClasses(payout.status)}`}
                >
                  {payout.status}
                </span>
              </div>
              <div className="mt-1 text-xs text-neutral-500">
                Attempts: {payout.attempt_count}
              </div>
              {payout.failure_reason && (
                <div className="mt-1 text-xs text-red-400">
                  {payout.failure_reason}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}