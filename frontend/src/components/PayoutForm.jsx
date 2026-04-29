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
    [loading, merchantId, amount, bankAccountId]
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

  return (
    <div className="rounded-lg border bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold">Create payout</h2>
      <form className="mt-4 grid gap-4 sm:grid-cols-3" onSubmit={submit}>
        <div className="sm:col-span-1">
          <label className="text-sm font-medium text-slate-600">Amount (₹)</label>
          <input
            className="mt-1 w-full rounded border px-3 py-2 text-sm"
            type="number"
            min="1"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </div>
        <div className="sm:col-span-1">
          <label className="text-sm font-medium text-slate-600">
            Bank account
          </label>
          <select
            className="mt-1 w-full rounded border px-3 py-2 text-sm"
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
            className="w-full rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            type="submit"
            disabled={!canSubmit}
          >
            {loading ? "Creating..." : "Create payout"}
          </button>
        </div>
      </form>
      {message && <p className="mt-3 text-sm text-emerald-600">{message}</p>}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}
