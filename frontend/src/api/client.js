import { localApiFetch } from "./localBackend.js";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api/v1";
const DEFAULT_MERCHANT_ID = import.meta.env.VITE_MERCHANT_ID || "";
const FORCE_LOCAL_BACKEND = import.meta.env.VITE_FORCE_LOCAL_BACKEND === "true";
let backendMode = FORCE_LOCAL_BACKEND ? "fallback" : "unknown";
const modeListeners = new Set();

function setBackendMode(mode) {
  if (backendMode === mode) {
    return;
  }
  backendMode = mode;
  for (const listener of modeListeners) {
    listener(backendMode);
  }
}

export function getBackendMode() {
  return backendMode;
}

export function subscribeBackendMode(listener) {
  modeListeners.add(listener);
  listener(backendMode);
  return () => {
    modeListeners.delete(listener);
  };
}

export async function apiFetch(path, options = {}) {
  if (FORCE_LOCAL_BACKEND) {
    setBackendMode("fallback");
    return localApiFetch(path, options);
  }

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

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...requestOptions,
      headers,
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : null;

    if (!response.ok) {
      if (response.status >= 500) {
        setBackendMode("fallback");
        return localApiFetch(path, options);
      }
      const message = data?.detail || "Request failed";
      const error = new Error(message);
      error.name = "ApiResponseError";
      throw error;
    }

    setBackendMode("backend");
    return data;
  } catch (error) {
    if (error instanceof Error && error.name === "ApiResponseError") {
      throw error;
    }
    setBackendMode("fallback");
    return localApiFetch(path, options);
  }
}
