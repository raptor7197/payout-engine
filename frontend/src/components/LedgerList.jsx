export default function LedgerList({ ledger, loading }) {
  return (
    <div className="rounded-lg border bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold">Ledger</h2>
      {loading ? (
        <p className="text-sm text-slate-500">Loading ledger...</p>
      ) : ledger.length === 0 ? (
        <p className="text-sm text-slate-500">No ledger entries yet.</p>
      ) : (
        <ul className="mt-4 space-y-2 text-sm">
          {ledger.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between">
              <span>{entry.entry_type.replaceAll("_", " ")}</span>
              <span className="font-medium">₹{entry.amount_paise / 100}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
