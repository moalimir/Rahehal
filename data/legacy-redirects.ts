import { CHALLENGE_ROUTE_IDS } from "@/lib/challenges/ids";

export type LegacyRedirectResolution = {
  kind: "redirect";
  source: string;
  target: string;
};

export type LegacyUnavailableResolution = {
  kind: "unavailable";
  source: string;
  title: string;
  description: string;
  nextRoute: string;
  nextLabel: string;
};

export type LegacyRouteResolution = LegacyRedirectResolution | LegacyUnavailableResolution;

const redirect = (source: string, target: string): LegacyRedirectResolution => ({
  kind: "redirect",
  source,
  target,
});

const unavailable = (
  source: string,
  title: string,
  description: string,
  nextRoute: string,
  nextLabel: string,
): LegacyUnavailableResolution => ({
  kind: "unavailable",
  source,
  title,
  description,
  nextRoute,
  nextLabel,
});

/**
 * Legacy URLs are compatibility contracts, not aliases chosen for convenience.
 * Redirects below are limited to equivalent jobs-to-be-done. Removed or record-scoped
 * capabilities deliberately resolve to an explanatory unavailable page.
 */
export const legacyRouteEntries: LegacyRouteResolution[] = [
  redirect("/trust", "/trust-security"),
  redirect("/solver", "/app/solver/dashboard"),
  redirect("/solver/profile", "/app/solver/profile"),
  redirect("/solver/verification", "/app/solver/verification"),
  unavailable(
    "/solver/eligibility",
    "صفحه قدیمی شرایط مشارکت دیگر فعال نیست",
    "شرایط مشارکت اکنون برای هر فرصت و در همان پرونده نمایش داده می‌شود؛ انتقال به احراز هویت معنای این صفحه را تغییر می‌داد.",
    "/app/solver/opportunities",
    "مشاهده فرصت‌ها",
  ),
  redirect("/solver/teams", "/app/solver/teams"),
  unavailable(
    "/solver/data-room",
    "اتاق داده به پرونده مشخص نیاز دارد",
    "نشانی قدیمی فاقد شناسه فرصت یا پیشنهاد است. از فهرست پیشنهادها وارد اتاق داده همان پرونده شوید.",
    "/app/solver/proposals",
    "رفتن به پیشنهادهای راه‌حل",
  ),
  redirect("/solver/submissions/new", "/app/solver/proposals/new"),
  redirect("/solver/submissions/sample", "/app/solver/proposals/PR-104/preview"),
  unavailable(
    "/solver/contracts",
    "قرارداد باید از پرونده منتخب باز شود",
    "این نشانی قدیمی قرارداد و پرداخت را با هم مخلوط می‌کرد. قرارداد معتبر پس از ثبت تصمیم و از داخل پرونده مربوط در دسترس است.",
    "/app/solver/proposals",
    "مشاهده پرونده‌های من",
  ),
  redirect("/solver/payments", "/app/solver/payments"),
  redirect("/solver/pilots/sample", "/app/solver/pilots/PIL-021"),
  unavailable(
    "/solver/reputation",
    "امتیاز اعتبار قدیمی بازنشسته شده است",
    "پروفایل حرفه‌ای و احراز اعتبار اکنون شواهد را جداگانه نمایش می‌دهند و امتیاز ترکیبی بدون مبنا تولید نمی‌شود.",
    "/app/solver/profile",
    "مشاهده پروفایل حرفه‌ای",
  ),
  redirect("/solver/settings", "/app/solver/settings"),
  redirect("/solver/opportunities", "/app/solver/opportunities"),
  redirect("/solver/received-proposals", "/app/solver/received-proposals"),
  redirect("/solver/team-building", "/app/solver/team-building"),
  redirect("/solver/proposals", "/app/solver/proposals"),
  redirect("/solver/proposals/new", "/app/solver/proposals/new"),
  redirect("/solver/saved", "/app/solver/saved"),
  redirect("/solver/invitations", "/app/solver/invitations"),
  redirect("/org", "/app/org/dashboard"),
  redirect("/org/challenges", "/app/org/challenges"),
  redirect("/org/intake", "/app/org/challenges/new"),
  redirect("/org/triage", "/app/org/challenges/triage"),
  redirect("/org/challenges/new", "/app/org/challenges/new"),
  unavailable(
    "/org/approvals",
    "تأییدهای انتشار به پرونده مشخص نیاز دارد",
    "برای جلوگیری از ثبت تأیید روی پرونده اشتباه، ابتدا مسئله را انتخاب کنید و سپس بخش تأییدهای همان نسخه را باز کنید.",
    "/app/org/challenges",
    "انتخاب مسئله",
  ),
  redirect("/org/challenges/sample", "/app/org/challenges/CH-1405-021/overview"),
  unavailable(
    "/org/challenges/sample/operations",
    "عملیات پرونده به بخش مشخص نیاز دارد",
    "نشانی قدیمی چند کار متفاوت را در یک صفحه جمع می‌کرد. از نمای پرونده، بخش موردنیاز را انتخاب کنید.",
    "/app/org/challenges/CH-1405-021/overview",
    "بازکردن نمای پرونده",
  ),
  redirect("/org/challenges/sample/timeline", "/app/org/challenges/CH-1405-021/timeline"),
  redirect("/org/challenges/sample/experts", "/app/org/challenges/CH-1405-021/experts"),
  redirect("/org/challenges/sample/proposals", "/app/org/challenges/CH-1405-021/proposals"),
  redirect("/org/challenges/sample/compare", "/app/org/challenges/CH-1405-021/proposals/compare"),
  redirect("/org/challenges/sample/review", "/app/org/challenges/CH-1405-021/review"),
  redirect("/org/challenges/sample/decision", "/app/org/challenges/CH-1405-021/decision"),
  redirect("/org/challenges/sample/contract", "/app/org/challenges/CH-1405-021/contract"),
  redirect("/org/challenges/sample/pilot", "/app/org/challenges/CH-1405-021/pilot"),
  redirect("/org/challenges/sample/deliverables", "/app/org/challenges/CH-1405-021/deliverables"),
  redirect("/org/challenges/sample/finance", "/app/org/challenges/CH-1405-021/finance"),
  redirect("/org/challenges/sample/impact", "/app/org/challenges/CH-1405-021/impact"),
  redirect("/org/challenges/sample/documents", "/app/org/challenges/CH-1405-021/documents"),
  redirect("/org/challenges/sample/conversations", "/app/org/challenges/CH-1405-021/conversations"),
  redirect("/org/challenges/sample/history", "/app/org/challenges/CH-1405-021/history"),
  redirect("/org/submissions", "/app/org/proposals"),
  unavailable(
    "/org/reviewers",
    "مدیریت داوران به پرونده مشخص منتقل شده است",
    "داور با کنترل ظرفیت و تعارض منافع از داخل پرونده مسئله تخصیص داده می‌شود و با فهرست متخصصان یکسان نیست.",
    "/app/org/challenges",
    "انتخاب پرونده",
  ),
  unavailable(
    "/org/decisions",
    "تصمیم نهایی به پرونده مشخص نیاز دارد",
    "نشانی قدیمی شناسه مسئله را نداشت و می‌توانست تصمیم را روی پرونده نمونه باز کند.",
    "/app/org/proposals",
    "مشاهده پیشنهادها",
  ),
  redirect("/org/contracts", "/app/org/contracts-payments"),
  redirect("/org/finance", "/app/org/contracts-payments"),
  redirect("/org/pilots", "/app/org/pilots"),
  unavailable(
    "/org/impact",
    "سنجش اثر به پایلوت مشخص نیاز دارد",
    "از فهرست پایلوت‌ها پرونده مرتبط را انتخاب کنید تا خط پایه، مقدار واقعی و شواهد همان پایلوت نمایش داده شود.",
    "/app/org/pilots",
    "مشاهده پایلوت‌ها",
  ),
  unavailable(
    "/org/audit",
    "تاریخچه حسابرسی به پرونده مشخص نیاز دارد",
    "این نشانی قدیمی نمی‌تواند مالک یا سطح دسترسی رکورد را تعیین کند.",
    "/app/org/challenges",
    "انتخاب پرونده",
  ),
  redirect("/org/members", "/app/org/access"),
  redirect("/org/team", "/app/org/team"),
  unavailable(
    "/org/verification",
    "احراز سازمان از تنظیمات عمومی جداست",
    "پرونده احراز سازمان باید با سطح دسترسی مناسب باز شود؛ این قابلیت در نسخه نمایشی عمومی ارائه نمی‌شود.",
    "/app/org/profile",
    "مشاهده پروفایل سازمان",
  ),
  redirect("/org/reports", "/app/org/reports"),
  redirect("/org/settings", "/app/org/settings"),
  redirect("/reviewer", "/app/reviewer/assignments"),
  redirect("/reviewer/assignments/RV-204/conflict", "/app/reviewer/assignments/RV-204/conflict"),
  redirect("/reviewer/assignments/RV-204/score", "/app/reviewer/assignments/RV-204/score"),
  redirect("/reviewer/assignments/RV-204/submit", "/app/reviewer/assignments/RV-204/submit"),
  redirect("/ops", "/app/ops/dashboard"),
  redirect("/ops/kyc", "/app/ops/verification"),
  redirect("/ops/quality-gate", "/app/ops/publication"),
  redirect("/ops/moderation", "/app/ops/violations"),
  redirect("/ops/review-monitoring", "/app/ops/reviews"),
  redirect("/ops/disputes", "/app/ops/disputes"),
  redirect("/ops/payments", "/app/ops/payments"),
  unavailable(
    "/ops/support",
    "صف پشتیبانی در این نسخه در دسترس نیست",
    "پرونده پشتیبانی از صف عملیات و کنترل انتشار جداست و نباید به یکی از آن‌ها هدایت شود.",
    "/app/ops/queue",
    "بازگشت به صف عملیات",
  ),
  unavailable(
    "/ops/system",
    "سلامت سامانه از تنظیمات جداست",
    "نشانی قدیمی سلامت سامانه را با تنظیمات عملیات یکی می‌کرد. این قابلیت در نسخه نمایشی مستقل ارائه نمی‌شود.",
    "/app/ops/dashboard",
    "بازگشت به داشبورد عملیات",
  ),
  redirect("/ops/settings", "/app/ops/settings"),
];

export const legacyRedirectEntries = legacyRouteEntries.filter(
  (entry): entry is LegacyRedirectResolution => entry.kind === "redirect",
);

export function normalizeRoutePath(path: string): string {
  const withoutHash = path.split("#")[0];
  const withoutQuery = withoutHash.split("?")[0];
  return withoutQuery !== "/" ? withoutQuery.replace(/\/+$/, "") : "/";
}

export function getLegacyResolution(path: string): LegacyRouteResolution | undefined {
  const normalized = normalizeRoutePath(path);
  const direct = legacyRouteEntries.find((entry) => entry.source === normalized);
  if (direct) return direct;
  const challenge = normalized.match(
    /^\/org\/challenges\/([^/]+)(?:\/(edit|studio|preview|submitted))?$/,
  );
  if (!challenge) return undefined;
  const [, id, segment] = challenge;
  if (!(CHALLENGE_ROUTE_IDS as readonly string[]).includes(id)) return undefined;
  return redirect(normalized, `/app/org/challenges/${id}${segment ? `/${segment}` : ""}`);
}

export function getLegacyRedirect(path: string): string | undefined {
  const resolution = getLegacyResolution(path);
  return resolution?.kind === "redirect" ? resolution.target : undefined;
}
