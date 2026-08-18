export const productGlossary = {
  challenge: "چالش",
  opportunity: "فرصت",
  proposal: "پیشنهاد راه‌حل",
  draft: "پیش‌نویس",
  review: "ارزیابی",
  eligibility: "شرایط مشارکت",
  verification: "احراز هویت و اعتبار",
  receipt: "رسید ثبت",
  audit: "تاریخچه حسابرسی",
  milestone: "مرحله اجرایی",
  deliverable: "خروجی قابل تحویل",
  workspace: "فضای کاری",
  baseline: "خط پایه",
  actual: "مقدار واقعی",
  roi: "بازده سرمایه‌گذاری",
} as const;

export function technicalTerm(fa: string, en: string) {
  return `${fa} (${en})`;
}
