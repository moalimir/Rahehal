import type { AppPersona } from "@/domain/persona";

export type ServiceMode = "success" | "offline" | "conflict" | "error";

export type ActionReceipt = {
  id: string;
  action: string;
  version: string;
  serverTime: string;
  nextAction: string;
  entityRef: string;
  auditEventId: string;
};

export type ProductCommand = {
  action: string;
  entityRef: string;
  actorRole: AppPersona;
  idempotencyKey: string;
};

type StoredCommand = ProductCommand & {
  revision: number;
  recordedAt: string;
  receipt: ActionReceipt;
};

type CommandStore = {
  version: 1;
  commands: StoredCommand[];
  projections: Record<string, { revision: number; lastAction: string; updatedAt: string }>;
};

const STORE_KEY = "rahhal.demo-command-store.v1";

export class InternalServiceError extends Error {
  constructor(
    message: string,
    public readonly code: "OFFLINE" | "CONFLICT" | "BLOCKED",
    public readonly correlationId: string,
  ) {
    super(message);
  }
}

function emptyStore(): CommandStore {
  return { version: 1, commands: [], projections: {} };
}

function readStore(): CommandStore {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORE_KEY) ?? "null") as CommandStore | null;
    return parsed?.version === 1 && Array.isArray(parsed.commands) && parsed.projections
      ? parsed
      : emptyStore();
  } catch {
    localStorage.removeItem(STORE_KEY);
    return emptyStore();
  }
}

function nextActionFor(action: string) {
  if (action.includes("پیشنهاد") || action.includes("راه‌حل"))
    return "نسخه ارسال‌شده قفل شد و وضعیت آن از فهرست پیشنهادهای راه‌حل قابل پیگیری است.";
  if (action.includes("دعوت"))
    return "دعوت در پرونده مخاطب ثبت شد و تا زمان پاسخ، از بخش دعوت‌ها قابل لغو است.";
  if (action.includes("تحویل"))
    return "خروجی برای پذیرش فنی ثبت شد؛ تأیید مالی تا پایان این بررسی مستقل باقی می‌ماند.";
  return "وضعیت پرونده و تاریخچه حسابرسی به‌روز شد و مسئول مرحله بعد اعلان دریافت می‌کند.";
}

export async function performProductAction(
  command: ProductCommand,
  mode: ServiceMode = "success",
): Promise<ActionReceipt> {
  await new Promise((resolve) => window.setTimeout(resolve, 180));
  if (mode === "offline")
    throw new InternalServiceError(
      "اتصال قطع است؛ ورودی حفظ شده و می‌توانید دوباره تلاش کنید.",
      "OFFLINE",
      "cor_off_204",
    );
  if (mode === "conflict")
    throw new InternalServiceError(
      "نسخه جدیدتری وجود دارد؛ پیش از ادامه تغییرها را مقایسه کنید.",
      "CONFLICT",
      "cor_con_882",
    );
  if (mode === "error")
    throw new InternalServiceError(
      "اقدام ثبت نشد؛ اطلاعات الزامی همین مرحله را تکمیل و دوباره تلاش کنید.",
      "BLOCKED",
      "cor_blk_119",
    );

  const store = readStore();
  const duplicate = store.commands.find(
    (stored) => stored.idempotencyKey === command.idempotencyKey,
  );
  if (duplicate) return duplicate.receipt;
  const revision = (store.projections[command.entityRef]?.revision ?? 0) + 1;
  const now = new Date();
  const unique = `${now.getTime().toString(36)}-${revision.toString(36)}`;
  const receipt: ActionReceipt = {
    id: `RC-${unique}`,
    action: command.action,
    version: `v${revision.toLocaleString("en-US")}`,
    serverTime: new Intl.DateTimeFormat("fa-IR", {
      dateStyle: "medium",
      timeStyle: "medium",
      timeZone: "Asia/Tehran",
    }).format(now),
    nextAction: nextActionFor(command.action),
    entityRef: command.entityRef,
    auditEventId: `AUD-${unique}`,
  };
  const recorded: StoredCommand = {
    ...command,
    revision,
    recordedAt: now.toISOString(),
    receipt,
  };
  const nextStore: CommandStore = {
    version: 1,
    commands: [...store.commands, recorded].slice(-250),
    projections: {
      ...store.projections,
      [command.entityRef]: { revision, lastAction: command.action, updatedAt: now.toISOString() },
    },
  };
  localStorage.setItem(STORE_KEY, JSON.stringify(nextStore));
  window.dispatchEvent(new CustomEvent("rahhal:product-command", { detail: recorded }));
  return receipt;
}

/** QA-only compatibility helper. Production UI uses performProductAction. */
export async function performDemoAction(action: string, mode: ServiceMode = "success") {
  return performProductAction(
    {
      action,
      entityRef: "qa:harness",
      actorRole: "ops",
      idempotencyKey: `qa:${action}:${Date.now()}`,
    },
    mode,
  );
}

export function readProductActionProjection(entityRef: string) {
  return typeof window === "undefined" ? undefined : readStore().projections[entityRef];
}
