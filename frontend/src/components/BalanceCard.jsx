export default function BalanceCard({ summary, loading }) {
  return (
    <section className="rounded-md border border-neutral-800 bg-neutral-900 p-5">
      <header className="mb-4 flex items-baseline justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-400">
          Balances
        </h2>
      </header>
      {loading ? (
        <p className="text-sm text-neutral-500">Loading balances...</p>
      ) : (
        <dl className="mt-2 grid gap-4 sm:grid-cols-2">
          <div className="rounded-md border border-neutral-800 bg-neutral-950 p-4">
            <dt className="text-xs uppercase tracking-wide text-neutral-500">
              Available
            </dt>
            <dd className="mt-2 font-mono text-2xl tabular-nums text-neutral-50">
              ₹{(summary?.available_balance_paise || 0) / 100}
            </dd>
          </div>
          <div className="rounded-md border border-neutral-800 bg-neutral-950 p-4">
            <dt className="text-xs uppercase tracking-wide text-neutral-500">
              Held
            </dt>
            <dd className="mt-2 font-mono text-2xl tabular-nums text-neutral-50">
              ₹{(summary?.held_balance_paise || 0) / 100}
            </dd>
          </div>
        </dl>
      )}
    </section>
  );
}