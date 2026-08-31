export default function LedgerList({ ledger, loading }) {
  return (
    <section className="flex flex-col rounded-md border border-neutral-800 bg-neutral-900 p-5">
      <header className="mb-4">
        <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-400">
          Ledger
        </h2>
      </header>
      {loading ? (
        <p className="text-sm text-neutral-500">Loading ledger...</p>
      ) : ledger.length === 0 ? (
        <p className="text-sm text-neutral-500">No ledger entries yet.</p>
      ) : (
        <ul className="divide-y divide-neutral-800 overflow-y-auto text-sm">
          {ledger.map((entry) => (
            <li
              key={entry.id}
              className="flex items-center justify-between py-2 first:pt-0 last:pb-0"
            >
              <span className="text-neutral-300">
                {entry.entry_type.replaceAll("_", " ")}
              </span>
              <span className="font-mono tabular-nums text-neutral-50">
                ₹{entry.amount_paise / 100}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}