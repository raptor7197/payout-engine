export default function BalanceCard({ summary, loading }) {
  return (
    <div className="rounded-lg border bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold">Balances</h2>
      {loading ? (
        <p className="text-sm text-slate-500">Loading balances...</p>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-sm text-slate-500">Available</p>
            <p className="text-2xl font-semibold">
              ₹{(summary?.available_balance_paise || 0) / 100}
            </p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Held</p>
            <p className="text-2xl font-semibold">
              ₹{(summary?.held_balance_paise || 0) / 100}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
