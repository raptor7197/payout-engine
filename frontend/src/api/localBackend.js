const STORAGE_KEY = "playtopay.local.backend.v1";
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 30 * 1000;
const RETRY_TIMEOUT_MS = 30 * 1000;

let processorStarted = false;

function nowIso() {
  return new Date().toISOString();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function parseMaybeJson(value) {
  if (!value) {
    return {};
  }
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  return value;
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  const pairs = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
  return `{${pairs.join(",")}}`;
}

function simpleHash(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash +=
      (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function getHeader(headers, key) {
  if (!headers) {
    return "";
  }
  const target = key.toLowerCase();
  for (const [headerKey, value] of Object.entries(headers)) {
    if (headerKey.toLowerCase() === target) {
      return value;
    }
  }
  return "";
}

function nextId(state, bucket) {
  const value = state.nextIds[bucket];
  state.nextIds[bucket] += 1;
  return value;
}

function createInitialState() {
  const state = {
    nextIds: {
      merchant: 1,
      bankAccount: 1,
      payout: 1,
      ledger: 1,
      idempotency: 1,
      transition: 1,
    },
    merchants: [],
    balances: {},
    bankAccounts: [],
    payouts: [],
    ledgerEntries: [],
    idempotencyKeys: [],
    transitions: [],
  };

  const seeds = [
    { name: "demo merchant", email: "merchant@example.com", ifsc: "TEST0001", account: "****0000", credit: 100000 },
    { name: "demo merchant 2", email: "merchant2@example.com", ifsc: "TEST0002", account: "****1111", credit: 50000 },
    { name: "demo merchant 3", email: "merchant3@example.com", ifsc: "TEST0003", account: "****2222", credit: 75000 },
    { name: "demo merchant 4", email: "merchant4@example.com", ifsc: "TEST0004", account: "****3333", credit: 60000 },
    { name: "demo merchant 5", email: "merchant5@example.com", ifsc: "TEST0005", account: "****4444", credit: 125000 },
    { name: "demo merchant 6", email: "merchant6@example.com", ifsc: "TEST0006", account: "****5555", credit: 90000 },
  ];

  for (const seed of seeds) {
    const merchantId = nextId(state, "merchant");
    const createdAt = nowIso();
    state.merchants.push({
      id: merchantId,
      name: seed.name,
      email: seed.email,
      created_at: createdAt,
      updated_at: createdAt,
    });
    state.balances[String(merchantId)] = {
      available_balance_paise: seed.credit,
      held_balance_paise: 0,
    };
    state.bankAccounts.push({
      id: nextId(state, "bankAccount"),
      merchant_id: merchantId,
      account_masked: seed.account,
      ifsc: seed.ifsc,
      is_active: true,
      created_at: createdAt,
      updated_at: createdAt,
    });
    addLedgerEntry(state, {
      merchantId,
      entryType: "credit",
      amountPaise: seed.credit,
      reference: { source: "seed-local" },
      payoutId: null,
      createdAt,
    });
  }

  return state;
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const initialState = createInitialState();
    saveState(initialState);
    return initialState;
  }

  try {
    return JSON.parse(raw);
  } catch {
    const initialState = createInitialState();
    saveState(initialState);
    return initialState;
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function ensureProcessor() {
  if (processorStarted) {
    return;
  }
  processorStarted = true;
  setInterval(() => {
    const state = loadState();
    const changed = processPayoutQueue(state);
    if (changed) {
      saveState(state);
    }
  }, 5000);
}

function merchantBalance(state, merchantId) {
  const key = String(merchantId);
  if (!state.balances[key]) {
    state.balances[key] = { available_balance_paise: 0, held_balance_paise: 0 };
  }
  return state.balances[key];
}

function addTransition(state, payout, fromStatus, toStatus, actor, metadata = {}) {
  const timestamp = nowIso();
  state.transitions.push({
    id: nextId(state, "transition"),
    payout_id: payout.id,
    from_status: fromStatus,
    to_status: toStatus,
    actor,
    metadata,
    created_at: timestamp,
  });
}

function addLedgerEntry(
  state,
  { merchantId, entryType, amountPaise, payoutId = null, reference = {}, createdAt = nowIso() }
) {
  state.ledgerEntries.push({
    id: nextId(state, "ledger"),
    merchant_id: merchantId,
    entry_type: entryType,
    amount_paise: amountPaise,
    payout_id: payoutId,
    reference,
    created_at: createdAt,
  });
}

function serializePayout(payout) {
  return {
    id: payout.id,
    amount_paise: payout.amount_paise,
    status: payout.status,
    attempt_count: payout.attempt_count,
    failure_reason: payout.failure_reason,
    created_at: payout.created_at,
    updated_at: payout.updated_at,
    processing_started_at: payout.processing_started_at,
    completed_at: payout.completed_at,
    failed_at: payout.failed_at,
  };
}

function completePayout(state, payout) {
  if (payout.status !== "processing") {
    return;
  }
  const balance = merchantBalance(state, payout.merchant_id);
  const previousStatus = payout.status;
  const timestamp = nowIso();
  payout.status = "completed";
  payout.completed_at = timestamp;
  payout.updated_at = timestamp;
  payout.next_retry_at = null;
  balance.held_balance_paise -= payout.amount_paise;
  addTransition(state, payout, previousStatus, "completed", "worker");
  addLedgerEntry(state, {
    merchantId: payout.merchant_id,
    entryType: "payout_debit_final",
    amountPaise: payout.amount_paise,
    payoutId: payout.id,
  });
}

function failPayout(state, payout, reason) {
  if (payout.status !== "processing") {
    return;
  }
  const balance = merchantBalance(state, payout.merchant_id);
  const previousStatus = payout.status;
  const timestamp = nowIso();
  payout.status = "failed";
  payout.failure_reason = reason;
  payout.failed_at = timestamp;
  payout.updated_at = timestamp;
  payout.next_retry_at = null;
  balance.held_balance_paise -= payout.amount_paise;
  balance.available_balance_paise += payout.amount_paise;
  addTransition(state, payout, previousStatus, "failed", "worker");
  addLedgerEntry(state, {
    merchantId: payout.merchant_id,
    entryType: "payout_release",
    amountPaise: payout.amount_paise,
    payoutId: payout.id,
  });
}

function processSinglePayoutAttempt(state, payout, nowTs) {
  if (payout.status === "completed" || payout.status === "failed") {
    return false;
  }

  if (payout.status === "pending") {
    const previousStatus = payout.status;
    const startedAt = nowIso();
    payout.status = "processing";
    payout.processing_started_at = startedAt;
    payout.updated_at = startedAt;
    addTransition(state, payout, previousStatus, "processing", "worker");
  } else if (payout.status === "processing") {
    const nextRetryTs = payout.next_retry_at ? Date.parse(payout.next_retry_at) : null;
    const startedTs = payout.processing_started_at
      ? Date.parse(payout.processing_started_at)
      : nowTs;
    const shouldProcess =
      (nextRetryTs !== null && nextRetryTs <= nowTs) ||
      (nextRetryTs === null && nowTs - startedTs >= RETRY_TIMEOUT_MS) ||
      payout.attempt_count === 0;
    if (!shouldProcess) {
      return false;
    }
  } else {
    return false;
  }

  if (payout.attempt_count >= MAX_ATTEMPTS) {
    failPayout(state, payout, "max retries exceeded");
    return true;
  }

  payout.attempt_count += 1;
  payout.updated_at = nowIso();

  const outcome = Math.random();
  if (outcome < 0.7) {
    completePayout(state, payout);
    return true;
  }
  if (outcome < 0.9) {
    failPayout(state, payout, "simulated failure");
    return true;
  }

  const backoff = BASE_BACKOFF_MS * 2 ** (payout.attempt_count - 1);
  payout.next_retry_at = new Date(nowTs + backoff).toISOString();
  payout.updated_at = nowIso();
  return true;
}

function processPayoutQueue(state) {
  const nowTs = Date.now();
  let changed = false;
  const ordered = [...state.payouts].sort(
    (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)
  );
  for (const payout of ordered) {
    if (processSinglePayoutAttempt(state, payout, nowTs)) {
      changed = true;
    }
  }
  return changed;
}

function normalizePath(path) {
  if (!path) {
    return "/";
  }
  return path.startsWith("/") ? path : `/${path}`;
}

function getMerchant(state, merchantId) {
  if (!merchantId) {
    return null;
  }
  return state.merchants.find((merchant) => merchant.id === Number(merchantId)) || null;
}

function httpError(status, detail) {
  const error = new Error(detail);
  error.status = status;
  throw error;
}

function finalizeIdempotency(record, statusCode, responseBody, resourceId = null) {
  record.response_status_code = statusCode;
  record.response_body = clone(responseBody);
  record.resource_id = resourceId ? String(resourceId) : null;
  record.state = "completed";
  record.updated_at = nowIso();
}

function buildActivityLog(state, merchantId) {
  const limit = 80;
  const events = [];
  const merchantPayoutIds = new Set(
    state.payouts
      .filter((payout) => payout.merchant_id === merchantId)
      .map((payout) => payout.id)
  );

  for (const transition of state.transitions) {
    if (!merchantPayoutIds.has(transition.payout_id)) {
      continue;
    }
    events.push({
      id: `transition:${transition.id}`,
      timestamp: transition.created_at,
      source: "payout_transition",
      message: `payout ${transition.payout_id} moved ${transition.from_status} -> ${transition.to_status} by ${transition.actor}`,
      details: {
        payout_id: transition.payout_id,
        from_status: transition.from_status,
        to_status: transition.to_status,
        actor: transition.actor,
      },
    });
  }

  for (const entry of state.ledgerEntries) {
    if (entry.merchant_id !== merchantId) {
      continue;
    }
    let label = entry.entry_type;
    if (entry.entry_type === "payout_hold") {
      label = "payout funds held";
    } else if (entry.entry_type === "payout_release") {
      label = "payout funds released";
    } else if (entry.entry_type === "payout_debit_final") {
      label = "payout settled and debited";
    } else if (entry.entry_type === "credit") {
      label = "merchant credited";
    }

    events.push({
      id: `ledger:${entry.id}`,
      timestamp: entry.created_at,
      source: "ledger",
      message: `${label} (${(entry.amount_paise / 100).toFixed(2)} inr)`,
      details: {
        entry_type: entry.entry_type,
        amount_paise: entry.amount_paise,
        payout_id: entry.payout_id,
      },
    });
  }

  for (const record of state.idempotencyKeys) {
    if (record.merchant_id !== merchantId) {
      continue;
    }
    events.push({
      id: `idempotency:${record.id}`,
      timestamp: record.updated_at,
      source: "idempotency",
      message: `idempotency key ${record.key} is ${record.state}${record.response_status_code !== null ? ` (status ${record.response_status_code})` : ""}`,
      details: {
        key: record.key,
        state: record.state,
        response_status_code: record.response_status_code,
        resource_id: record.resource_id,
      },
    });
  }

  events.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
  return events.slice(0, limit);
}

export async function localApiFetch(path, options = {}) {
  ensureProcessor();
  const normalizedPath = normalizePath(path);
  const method = (options.method || "GET").toUpperCase();
  const requestBody = parseMaybeJson(options.body);
  const merchantId = options.merchantId ? Number(options.merchantId) : null;
  const idempotencyKey = getHeader(options.headers, "Idempotency-Key");

  const state = loadState();
  if (processPayoutQueue(state)) {
    saveState(state);
  }

  if (method === "GET" && normalizedPath === "/merchants") {
    return clone([...state.merchants].sort((a, b) => a.id - b.id));
  }

  const merchant = getMerchant(state, merchantId);
  if (!merchant) {
    httpError(401, "Invalid merchant credentials");
  }

  if (method === "GET" && normalizedPath === "/merchant/summary") {
    const balance = merchantBalance(state, merchant.id);
    return {
      merchant_id: merchant.id,
      available_balance_paise: balance.available_balance_paise,
      held_balance_paise: balance.held_balance_paise,
    };
  }

  if (method === "GET" && normalizedPath === "/bank-accounts") {
    return clone(
      state.bankAccounts
        .filter(
          (account) => account.merchant_id === merchant.id && account.is_active === true
        )
        .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
        .map((account) => ({
          id: account.id,
          account_masked: account.account_masked,
          ifsc: account.ifsc,
          is_active: account.is_active,
          created_at: account.created_at,
        }))
    );
  }

  if (method === "POST" && normalizedPath === "/bank-accounts") {
    const accountMasked = String(requestBody.account_masked || "").trim();
    const ifsc = String(requestBody.ifsc || "").trim();
    if (!accountMasked || !ifsc) {
      httpError(400, "Invalid bank account payload");
    }
    const timestamp = nowIso();
    const account = {
      id: nextId(state, "bankAccount"),
      merchant_id: merchant.id,
      account_masked: accountMasked,
      ifsc,
      is_active: true,
      created_at: timestamp,
      updated_at: timestamp,
    };
    state.bankAccounts.push(account);
    saveState(state);
    return {
      id: account.id,
      account_masked: account.account_masked,
      ifsc: account.ifsc,
      is_active: account.is_active,
      created_at: account.created_at,
    };
  }

  if (method === "POST" && normalizedPath === "/credits") {
    const amountPaise = Number(requestBody.amount_paise || 0);
    if (amountPaise <= 0) {
      httpError(400, "amount_paise must be > 0");
    }
    const balance = merchantBalance(state, merchant.id);
    balance.available_balance_paise += amountPaise;
    addLedgerEntry(state, {
      merchantId: merchant.id,
      entryType: "credit",
      amountPaise,
      reference: { source: "manual" },
    });
    saveState(state);
    return { status: "credited" };
  }

  if (method === "GET" && normalizedPath === "/ledger") {
    return clone(
      state.ledgerEntries
        .filter((entry) => entry.merchant_id === merchant.id)
        .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
        .map((entry) => ({
          id: entry.id,
          entry_type: entry.entry_type,
          amount_paise: entry.amount_paise,
          payout_id: entry.payout_id,
          created_at: entry.created_at,
        }))
    );
  }

  if (method === "GET" && normalizedPath === "/payouts") {
    return clone(
      state.payouts
        .filter((payout) => payout.merchant_id === merchant.id)
        .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
        .map((payout) => serializePayout(payout))
    );
  }

  if (method === "POST" && normalizedPath === "/payouts") {
    if (!idempotencyKey) {
      httpError(400, "Idempotency-Key header is required");
    }

    const amountPaise = Number(requestBody.amount_paise || 0);
    const bankAccountId = Number(requestBody.bank_account_id || 0);
    if (amountPaise <= 0 || bankAccountId <= 0) {
      httpError(400, "Invalid payout payload");
    }

    const requestHash = simpleHash(
      stableStringify({
        method,
        path: normalizedPath,
        body: { amount_paise: amountPaise, bank_account_id: bankAccountId },
      })
    );
    const nowMs = Date.now();
    let record = state.idempotencyKeys.find(
      (item) => item.merchant_id === merchant.id && item.key === idempotencyKey
    );

    if (record && Date.parse(record.expires_at) <= nowMs) {
      state.idempotencyKeys = state.idempotencyKeys.filter((item) => item.id !== record.id);
      record = null;
    }

    if (record) {
      if (record.request_hash !== requestHash) {
        httpError(409, "Idempotency key reuse with different payload");
      }
      if (record.state === "completed" && record.response_body) {
        return clone(record.response_body);
      }
      if (
        record.state === "in_progress" &&
        record.response_body == null &&
        record.resource_id == null
      ) {
        httpError(409, "Idempotency key request in progress");
      }
    }

    if (!record) {
      const timestamp = nowIso();
      record = {
        id: nextId(state, "idempotency"),
        merchant_id: merchant.id,
        key: idempotencyKey,
        request_hash: requestHash,
        response_status_code: null,
        response_body: null,
        resource_type: "payout",
        resource_id: null,
        state: "in_progress",
        expires_at: new Date(nowMs + IDEMPOTENCY_TTL_MS).toISOString(),
        created_at: timestamp,
        updated_at: timestamp,
      };
      state.idempotencyKeys.push(record);
    }

    const bankAccount = state.bankAccounts.find(
      (account) =>
        account.id === bankAccountId &&
        account.merchant_id === merchant.id &&
        account.is_active === true
    );
    if (!bankAccount) {
      const body = { detail: "Bank account not found" };
      finalizeIdempotency(record, 404, body);
      saveState(state);
      httpError(404, body.detail);
    }

    const balance = merchantBalance(state, merchant.id);
    if (balance.available_balance_paise < amountPaise) {
      const body = { detail: "Insufficient available balance" };
      finalizeIdempotency(record, 400, body);
      saveState(state);
      httpError(400, body.detail);
    }

    balance.available_balance_paise -= amountPaise;
    balance.held_balance_paise += amountPaise;

    const timestamp = nowIso();
    const payout = {
      id: nextId(state, "payout"),
      merchant_id: merchant.id,
      bank_account_id: bankAccountId,
      amount_paise: amountPaise,
      status: "pending",
      attempt_count: 0,
      next_retry_at: null,
      failure_reason: null,
      idempotency_key: idempotencyKey,
      created_at: timestamp,
      updated_at: timestamp,
      processing_started_at: null,
      completed_at: null,
      failed_at: null,
    };
    state.payouts.push(payout);
    addLedgerEntry(state, {
      merchantId: merchant.id,
      entryType: "payout_hold",
      amountPaise,
      payoutId: payout.id,
    });
    addTransition(state, payout, "pending", "pending", "api", { note: "created" });

    const responseBody = serializePayout(payout);
    finalizeIdempotency(record, 201, responseBody, payout.id);
    saveState(state);
    return clone(responseBody);
  }

  if (method === "GET" && normalizedPath === "/activity-log") {
    return clone(buildActivityLog(state, merchant.id));
  }

  httpError(404, "endpoint not implemented in local fallback");
}
