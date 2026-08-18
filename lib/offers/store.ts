export type DirectOfferState = "pending" | "accepted" | "declined" | "expired" | "cancelled";

export type DirectOffer = {
  id: string;
  challengeId: string;
  recipientName: string;
  title: string;
  project: string;
  industry: string;
  summary: string;
  deadline: string;
  received: string;
  fit: string;
  state: DirectOfferState;
  rejectionReason?: string;
  updatedAt: string;
};

const STORE_KEY = "rahhal.demo-direct-offers.v1";

export const DIRECT_OFFER_ID_POOL = [
  "OFF-211",
  "OFF-219",
  "OFF-226",
  "OFF-DEMO-001",
  "OFF-DEMO-002",
  "OFF-DEMO-003",
  "OFF-DEMO-004",
  "OFF-DEMO-005",
  "OFF-DEMO-006",
  "OFF-DEMO-007",
  "OFF-DEMO-008",
] as const;

export const directOfferSeed: DirectOffer[] = [
  {
    id: "OFF-211",
    challengeId: "CH-1405-025",
    recipientName: "مریم شریفی",
    title: "دعوت به جلسه بررسی فنی",
    project: "تشخیص عیب سطحی قطعات با بینایی ماشین",
    industry: "ساخت‌وتولید",
    summary:
      "سازمان پس از بررسی پروفایل شما، برای ارائه توانمندی و تعیین دامنه پایلوت دعوت کرده است.",
    deadline: "تا ۲ روز دیگر",
    received: "امروز، ۹:۴۰",
    fit: "تجربه ثبت‌شده در بینایی ماشین",
    state: "accepted",
    updatedAt: "2026-08-15T06:10:00.000Z",
  },
  {
    id: "OFF-219",
    challengeId: "CH-1405-021",
    recipientName: "تیم نوآب",
    title: "پیشنهاد همکاری مستقیم برای پایلوت",
    project: "بازیابی هوشمند آب در خط شست‌وشوی صنعتی",
    industry: "انرژی و آب",
    summary: "برای تکمیل تیم اجرایی پایلوت بازیابی آب، درخواست همکاری مستقیم دریافت کرده‌اید.",
    deadline: "تا ۴ روز دیگر",
    received: "دیروز، ۱۵:۲۰",
    fit: "سابقه اجرای پایلوت صنعتی",
    state: "declined",
    updatedAt: "2026-08-14T11:50:00.000Z",
  },
  {
    id: "OFF-226",
    challengeId: "CH-1405-030",
    recipientName: "گروه زیست‌فرایند",
    title: "درخواست ارسال رزومه تکمیلی",
    project: "اعتبارسنجی شست‌وشوی بدون توقف خط آسپتیک",
    industry: "صنایع غذایی",
    summary: "سازمان برای ادامه ارزیابی، سوابق اجرای صنعتی و یک نمونه گزارش فنی درخواست کرده است.",
    deadline: "تا ۶ روز دیگر",
    received: "۲ روز پیش",
    fit: "رزومه و گزارش فنی قابل بررسی",
    state: "pending",
    updatedAt: "2026-08-13T09:00:00.000Z",
  },
];

function read(): DirectOffer[] {
  if (typeof window === "undefined") return directOfferSeed;
  try {
    const parsed = JSON.parse(localStorage.getItem(STORE_KEY) ?? "null") as {
      version?: number;
      offers?: DirectOffer[];
    } | null;
    return parsed?.version === 1 && Array.isArray(parsed.offers) ? parsed.offers : directOfferSeed;
  } catch {
    localStorage.removeItem(STORE_KEY);
    return directOfferSeed;
  }
}

function write(offers: DirectOffer[]) {
  localStorage.setItem(
    STORE_KEY,
    JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), offers }),
  );
  window.dispatchEvent(new CustomEvent("rahhal:direct-offers"));
}

export function listDirectOffers() {
  return read().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function createDirectOffer(input: Pick<DirectOffer, "recipientName">): DirectOffer {
  const now = new Date();
  const existing = read();
  const id =
    DIRECT_OFFER_ID_POOL.find((candidate) => !existing.some((offer) => offer.id === candidate)) ??
    "OFF-DEMO-008";
  const previous = existing.find((offer) => offer.id === id);
  const offer: DirectOffer = {
    id,
    challengeId: "CH-1405-021",
    recipientName: input.recipientName,
    title: "دعوت به ارائه پیشنهاد راه‌حل",
    project: "بازیابی هوشمند آب در خط شست‌وشوی صنعتی",
    industry: "انرژی و آب",
    summary: "گروه مپنا پس از بررسی پروفایل، از شما برای تدوین پاسخ فنی و مالی دعوت کرده است.",
    deadline: "تا ۷ روز دیگر",
    received: "همین حالا",
    fit: "مهارت و ظرفیت اعلام‌شده در پروفایل",
    state: "pending",
    updatedAt: now.toISOString(),
  };
  write([offer, ...existing.filter((item) => item.id !== previous?.id)]);
  return offer;
}

export function transitionDirectOffer(
  id: string,
  state: Extract<DirectOfferState, "accepted" | "declined" | "cancelled">,
  rejectionReason?: string,
) {
  const offers = read();
  const current = offers.find((offer) => offer.id === id);
  if (!current || current.state !== "pending") return current;
  const updated = { ...current, state, rejectionReason, updatedAt: new Date().toISOString() };
  write(offers.map((offer) => (offer.id === id ? updated : offer)));
  return updated;
}
