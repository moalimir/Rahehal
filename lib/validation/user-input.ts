const persianDigits = "۰۱۲۳۴۵۶۷۸۹";
const arabicDigits = "٠١٢٣٤٥٦٧٨٩";

export function normalizeDigits(value: string) {
  return value
    .replace(/[۰-۹]/g, (digit) => String(persianDigits.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String(arabicDigits.indexOf(digit)));
}

export function normalizePhone(value: string) {
  return normalizeDigits(value)
    .replace(/[\s\-()]/g, "")
    .replace(/^\+98/, "0")
    .replace(/^0098/, "0");
}

export function isIranianMobile(value: string) {
  return /^09\d{9}$/.test(normalizePhone(value));
}

export function isEmail(value: string) {
  const normalized = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalized);
}

export function identifierError(value: string) {
  const normalized = value.trim();
  if (!normalized) return "ایمیل یا شماره همراه را وارد کنید.";
  if (normalized.includes("@")) {
    return isEmail(normalized) ? "" : "ساختار ایمیل درست نیست؛ نمونه: name@example.com";
  }
  return isIranianMobile(normalized)
    ? ""
    : "شماره همراه باید ۱۱ رقم و با ۰۹ شروع شود؛ نمونه: ۰۹۱۲۱۲۳۴۵۶۷";
}

export function passwordError(value: string) {
  if (!value) return "رمز عبور را وارد کنید.";
  if (value.length < 8) return "رمز عبور باید حداقل ۸ کاراکتر باشد.";
  if (!/[A-Za-z\u0600-\u06FF]/.test(value) || !/\d/.test(normalizeDigits(value))) {
    return "رمز عبور باید دست‌کم یک حرف و یک عدد داشته باشد.";
  }
  return "";
}

export function urlError(value: string) {
  if (!value.trim()) return "";
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? ""
      : "پیوند باید با http:// یا https:// شروع شود.";
  } catch {
    return "پیوند نمونه‌کار معتبر نیست؛ نشانی کامل را وارد کنید.";
  }
}

export function otpError(value: string) {
  const normalized = normalizeDigits(value).replace(/\s/g, "");
  if (!normalized) return "رمز یک‌بارمصرف را وارد کنید.";
  return /^\d{5}$/.test(normalized) ? "" : "رمز یک‌بارمصرف باید دقیقاً ۵ رقم باشد.";
}
