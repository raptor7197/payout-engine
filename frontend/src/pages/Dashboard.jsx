import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../api/client.js";
import BalanceCard from "../components/BalanceCard.jsx";
import LedgerList from "../components/LedgerList.jsx";
import PayoutForm from "../components/PayoutForm.jsx";
import PayoutList from "../components/PayoutList.jsx";

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const hasMerchantId = useMemo(
    () => Boolean(import.meta.env.VITE_MERCHANT_ID),
    []
  );

  const loadData = async () => {
    try {
      setLoading(true);
      const [summaryData, bankData, payoutData, ledgerData] = await Promise.all([
        apiFetch("/merchant/summary"),
        apiFetch("/bank-accounts"),
        apiFetch("/payouts"),
        apiFetch("/ledger"),
      ]);
      setSummary(summaryData);
      setBankAccounts(bankData);
      setPayouts(payoutData);
      setLedger(ledgerData);
      setError("");
    } catch (err) {
      setError(err.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (hasMerchantId) {
      loadData();
    }
  }, [hasMerchantId]);

  if (!hasMerchantId) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900">
        Set <code className="font-semibold">VITE_MERCHANT_ID</code> in your env to
        load merchant data.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          {error}
        </div>
      )}
      <BalanceCard summary={summary} loading={loading} />
      <PayoutForm bankAccounts={bankAccounts} onCreated={loadData} />
      <div className="grid gap-6 lg:grid-cols-2">
        <PayoutList payouts={payouts} loading={loading} />
        <LedgerList ledger={ledger} loading={loading} />
      </div>
    </div>
  );
}
