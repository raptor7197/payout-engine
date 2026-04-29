const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api/v1";
const MERCHANT_ID = import.meta.env.VITE_MERCHANT_ID || "";

export async function apiFetch(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    "X-Merchant-Id": MERCHANT_ID,
    ...options.headers,
  };

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
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
