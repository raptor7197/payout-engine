import { useMemo, useState } from "react";
import { apiFetch } from "../api/client.js";

export default function PayoutForm({ merchantId, bankAccounts, onCreated }) {
  const [amount, setAmount] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const canSubmit = useMemo(
    () => !loading && merchantId && amount && bankAccountId,
    [loading, merchantId, amount, bankAccountId],
  );

  const submit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setError("");

    try {
      const idempotencyKey = crypto.randomUUID();
      const response = await apiFetch("/payouts", {
        merchantId,
        method: "POST",
        headers: {
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          amount_paise: Number(amount) * 100,
          bank_account_id: Number(bankAccountId),
        }),
      });
      setMessage(`Payout ${response.id} created.`);
      setAmount("");
      setBankAccountId("");
      onCreated?.();
    } catch (err) {
      setError(err.message || "Failed to create payout");
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    "mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 focus:border-neutral-500 focus:outline-none";

  return (
    <section className="rounded-md border border-neutral-800 bg-neutral-900 p-5">
      <header className="mb-4">
        <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-400">
          Create payout
        </h2>
      </header>
      <form className="grid gap-4 sm:grid-cols-3" onSubmit={submit}>
        <div className="sm:col-span-1">
          <label className="text-xs uppercase tracking-wide text-neutral-500">
            Amount (₹)
          </label>
          <input
            className={inputClass}
            type="number"
            min="1"
            placeholder="0"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </div>
        <div className="sm:col-span-1">
          <label className="text-xs uppercase tracking-wide text-neutral-500">
            Bank account
          </label>
          <select
            className={inputClass}
            value={bankAccountId}
            onChange={(event) => setBankAccountId(event.target.value)}
          >
            <option value="">Select account</option>
            {bankAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.account_masked} ({account.ifsc})
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button
            className="w-full rounded-md border border-neutral-200 bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-900 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:border-neutral-700 disabled:bg-neutral-800 disabled:text-neutral-500"
            type="submit"
            disabled={!canSubmit}
          >
            {loading ? "Creating..." : "Create payout"}
          </button>
        </div>
      </form>
      {message && (
        <p className="mt-3 text-sm text-emerald-400">{message}</p>
      )}
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
    </section>
  );
}