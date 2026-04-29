export default function PayoutList({ payouts, loading }) {
  return (
    <div className="rounded-lg border bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold">Payouts</h2>
      {loading ? (
        <p className="text-sm text-slate-500">Loading payouts...</p>
      ) : payouts.length === 0 ? (
        <p className="text-sm text-slate-500">No payouts yet.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {payouts.map((payout) => (
            <li key={payout.id} className="rounded border px-3 py-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium">₹{payout.amount_paise / 100}</span>
                <span className="rounded bg-slate-100 px-2 py-1 text-xs uppercase">
                  {payout.status}
                </span>
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Attempts: {payout.attempt_count}
              </div>
              {payout.failure_reason && (
                <div className="mt-1 text-xs text-red-500">
                  {payout.failure_reason}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
