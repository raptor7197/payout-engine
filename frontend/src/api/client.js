const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api/v1";
const DEFAULT_MERCHANT_ID = import.meta.env.VITE_MERCHANT_ID || "";

export async function apiFetch(path, options = {}) {
  const { merchantId, ...requestOptions } = options;
  const resolvedMerchantId =
    merchantId === undefined ? DEFAULT_MERCHANT_ID : merchantId;
  const headers = {
    "Content-Type": "application/json",
    ...requestOptions.headers,
  };
  if (resolvedMerchantId) {
    headers["X-Merchant-Id"] = String(resolvedMerchantId);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...requestOptions,
    headers,
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message = data?.detail || "Request failed";
    throw new Error(message);
  }

  return data;
}
