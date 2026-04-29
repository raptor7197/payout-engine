import { useEffect, useState } from "react";
import { apiFetch } from "../api/client.js";
import ActivityLog from "../components/ActivityLog.jsx";
import BalanceCard from "../components/BalanceCard.jsx";
import LedgerList from "../components/LedgerList.jsx";
import PayoutForm from "../components/PayoutForm.jsx";
import PayoutList from "../components/PayoutList.jsx";

export default function Dashboard() {
  const [merchants, setMerchants] = useState([]);
  const [merchantId, setMerchantId] = useState(
    import.meta.env.VITE_MERCHANT_ID || ""
  );
  const [summary, setSummary] = useState(null);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [activityLog, setActivityLog] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const loadData = async (currentMerchantId) => {
    if (!currentMerchantId) {
      setSummary(null);
      setBankAccounts([]);
      setPayouts([]);
      setLedger([]);
      setActivityLog([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const [summaryData, bankData, payoutData, ledgerData, activityData] =
        await Promise.all([
          apiFetch("/merchant/summary", { merchantId: currentMerchantId }),
          apiFetch("/bank-accounts", { merchantId: currentMerchantId }),
          apiFetch("/payouts", { merchantId: currentMerchantId }),
          apiFetch("/ledger", { merchantId: currentMerchantId }),
          apiFetch("/activity-log", { merchantId: currentMerchantId }),
        ]);
      setSummary(summaryData);
      setBankAccounts(bankData);
      setPayouts(payoutData);
      setLedger(ledgerData);
      setActivityLog(activityData);
      setError("");
    } catch (err) {
      setError(err.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadMerchants = async () => {
      try {
        const merchantData = await apiFetch("/merchants", { merchantId: "" });
        setMerchants(merchantData);
        if (!merchantData.length) {
          setMerchantId("");
          return;
        }
        const selectedExists = merchantData.some(
          (merchant) => String(merchant.id) === String(merchantId)
        );
        if (!selectedExists) {
          setMerchantId(String(merchantData[0].id));
        }
      } catch (err) {
        setError(err.message || "Failed to load merchants");
      }
    };

    loadMerchants();
  }, []);

  useEffect(() => {
    loadData(merchantId);
  }, [merchantId]);

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          {error}
        </div>
      )}
      <div className="rounded-lg border bg-white p-5 shadow-sm">
        <label className="text-sm font-medium text-slate-600">Merchant</label>
        <select
          className="mt-1 w-full rounded border px-3 py-2 text-sm sm:max-w-sm"
          value={merchantId}
          onChange={(event) => setMerchantId(event.target.value)}
        >
          {!merchants.length && <option value="">No merchants found</option>}
          {merchants.map((merchant) => (
            <option key={merchant.id} value={merchant.id}>
              {merchant.id} - {merchant.name}
            </option>
          ))}
        </select>
      </div>
      <BalanceCard summary={summary} loading={loading} />
      <PayoutForm
        key={merchantId}
        merchantId={merchantId}
        bankAccounts={bankAccounts}
        onCreated={() => loadData(merchantId)}
      />
      <div className="grid gap-6 xl:grid-cols-3">
        <PayoutList payouts={payouts} loading={loading} />
        <LedgerList ledger={ledger} loading={loading} />
        <ActivityLog events={activityLog} loading={loading} />
      </div>
    </div>
  );
}
