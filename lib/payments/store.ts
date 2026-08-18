export type PaymentState =
  | "triggered"
  | "approval"
  | "processing"
  | "paid"
  | "reconciled"
  | "hold"
  | "failed"
  | "refunded";

export type PaymentRecord = {
  id: string;
  state: PaymentState;
  technicalAccepted: boolean;
  financeApproved: boolean;
  contractEffective: boolean;
  updatedAt: string;
};

const KEY = "rahhal.demo-payments.v1";
export const PAYMENT_DEMO_SEED: PaymentRecord = {
  id: "PAY-204",
  state: "triggered",
  technicalAccepted: true,
  financeApproved: false,
  contractEffective: true,
  updatedAt: "2026-08-15T08:00:00.000Z",
};

function write(record: PaymentRecord) {
  if (typeof window === "undefined") return record;
  localStorage.setItem(KEY, JSON.stringify({ version: 1, record }));
  window.dispatchEvent(new CustomEvent("rahhal:payments"));
  return record;
}

export function readPayment(): PaymentRecord {
  if (typeof window === "undefined") return PAYMENT_DEMO_SEED;
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "null") as {
      version?: number;
      record?: PaymentRecord;
    } | null;
    return value?.version === 1 && value.record?.id === PAYMENT_DEMO_SEED.id
      ? value.record
      : PAYMENT_DEMO_SEED;
  } catch {
    localStorage.removeItem(KEY);
    return PAYMENT_DEMO_SEED;
  }
}

export function requestFinanceApproval(): PaymentRecord | null {
  const current = readPayment();
  if (current.state !== "triggered" || !current.technicalAccepted) return null;
  return write({ ...current, state: "approval", updatedAt: new Date().toISOString() });
}

export function approveFinance(): PaymentRecord | null {
  const current = readPayment();
  if (current.state !== "approval" || !current.contractEffective) return null;
  return write({
    ...current,
    state: "processing",
    financeApproved: true,
    updatedAt: new Date().toISOString(),
  });
}

export function confirmProviderPayment(): PaymentRecord | null {
  const current = readPayment();
  if (current.state !== "processing" || !current.financeApproved) return null;
  return write({ ...current, state: "paid", updatedAt: new Date().toISOString() });
}
