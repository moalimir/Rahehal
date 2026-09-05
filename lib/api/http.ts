import { browserSessionRoutes, type ApiErrorCode, type ErrorEnvelope } from "@rahhal/contracts";
import { parseCorrelationId } from "@rahhal/domain";

type ApiEnvelopeLike = {
  readonly ok: boolean;
};

const messages: Readonly<Record<ApiErrorCode, string>> = {
  VALIDATION: "اطلاعات درخواست معتبر نیست.",
  NO_ACCESS: "نشست یا دسترسی فعال برای این اقدام وجود ندارد.",
  NOT_FOUND: "پرونده در فضای کاری فعال در دسترس نیست.",
  INVALID_STATE: "این اقدام در وضعیت فعلی پرونده مجاز نیست.",
  CONFLICT: "نسخه پرونده تغییر کرده است؛ داده تازه را دریافت و دوباره تلاش کنید.",
  STEP_UP_REQUIRED: "برای این اقدام تأیید هویت تازه‌تری لازم است.",
  VERIFICATION_EXPIRED: "مهلت کد تأیید تمام شده است؛ یک کد تازه بگیرید.",
  VERIFICATION_LOCKED: "تلاش تأیید بسته شده است؛ فرایند را دوباره آغاز کنید.",
  RATE_LIMITED: "تعداد درخواست‌ها زیاد بوده است؛ کمی بعد دوباره تلاش کنید.",
  ACTIVATION_REQUIRED: "برای ادامه، فعال‌سازی اولیه حل‌گر را کامل کنید.",
  STORAGE: "ارتباط با سرویس برقرار نشد؛ با همان درخواست دوباره تلاش کنید.",
};

function unavailable(message = messages.STORAGE): ErrorEnvelope {
  return {
    ok: false,
    error: { code: "STORAGE", message, recovery: "retry_with_same_idempotency_key" },
    meta: {
      server_time: new Date().toISOString(),
      correlation_id: parseCorrelationId("cor_web_unavailable"),
    },
  };
}

function isEnvelope(value: unknown): value is ApiEnvelopeLike {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.ok === "boolean" && typeof candidate.meta === "object";
}

let refreshInFlight: Promise<boolean> | null = null;

async function refreshBrowserSession(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!refreshInFlight) {
    refreshInFlight = fetch(browserSessionRoutes.sessionRefresh, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        accept: "application/json",
        "idempotency-key": idempotencyKey("browser-session-refresh"),
      },
    })
      .then((response) => response.ok)
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

function apiRequest(path: string, init: RequestInit) {
  return fetch(path, {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      accept: "application/json",
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
  });
}

export async function requestApi<Success extends ApiEnvelopeLike>(
  path: string,
  init: RequestInit = {},
): Promise<Success | ErrorEnvelope> {
  try {
    let response = await apiRequest(path, init);
    if (
      response.status === 403 &&
      response.headers.get("x-rahhal-session-refresh") === "required" &&
      (await refreshBrowserSession())
    ) {
      response = await apiRequest(path, init);
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) return unavailable();
    const payload: unknown = await response.json();
    if (!isEnvelope(payload)) return unavailable("پاسخ سرویس با قرارداد مورد انتظار سازگار نیست.");
    if (!payload.ok) {
      const problem = payload as ErrorEnvelope;
      const code = problem.error?.code;
      if (!code || !(code in messages)) return unavailable();
      return {
        ...problem,
        error: { ...problem.error, message: messages[code] },
      };
    }
    if (!response.ok) return unavailable();
    return payload as Success;
  } catch {
    return unavailable();
  }
}

export function idempotencyKey(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}
