import {
  currentUser,
  type Attachment,
  type ChallengeRecord,
  type ChallengeStatus,
} from "@/domain/challenge";
import { isApplicantScope } from "@/domain/taxonomy";
import { createDemoSession } from "@/lib/auth/session";
import { isRecordReady } from "@/lib/challenges/validation";
import { safeUploadName } from "@/lib/validation/upload";

const STORAGE_KEY = "rahhal.organization-challenges.v8";
const PREVIOUS_STORAGE_KEY = "rahhal.organization-challenges.v7";
const LEGACY_STORAGE_KEY = "rahhal.organization-challenges.v6";
const SEEDED_KEY = "rahhal.organization-challenges.seeded.v8";
const PREVIOUS_SEEDED_KEY = "rahhal.organization-challenges.seeded.v7";
const STORE_VERSION = 8;
const PREVIOUS_STORE_VERSION = 7;
const STORE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

type ChallengeStoreEnvelope = {
  version: typeof STORE_VERSION;
  updatedAt: string;
  records: ChallengeRecord[];
};

type StoredChallengeEnvelope = {
  version: typeof STORE_VERSION | typeof PREVIOUS_STORE_VERSION;
  updatedAt: string;
  records: unknown[];
};

export const DRAFT_ID_POOL = Array.from(
  { length: 8 },
  (_, index) => `CH-DRAFT-${String(index + 1).padStart(3, "0")}`,
);

export const SEEDED_CHALLENGE_IDS = ["CH-1405-021", "CH-1405-034", "CH-1405-041", "CH-1405-052"];
export const CHALLENGE_ROUTE_IDS = [...SEEDED_CHALLENGE_IDS, ...DRAFT_ID_POOL];

function canUseStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function migrateRecord(value: unknown): ChallengeRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const stored = value as Record<string, unknown>;
  const candidate = stored.applicantScope ?? stored.teamType;
  const applicantScope = candidate === "" || isApplicantScope(candidate) ? candidate : "";
  const record = { ...stored };
  delete record.teamType;
  return { ...record, applicantScope } as ChallengeRecord;
}

function parseRecords(value: string | null): ChallengeRecord[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    const records = Array.isArray(parsed)
      ? parsed
      : parsed &&
          typeof parsed === "object" &&
          ((parsed as StoredChallengeEnvelope).version === STORE_VERSION ||
            (parsed as StoredChallengeEnvelope).version === PREVIOUS_STORE_VERSION) &&
          Array.isArray((parsed as StoredChallengeEnvelope).records) &&
          Date.now() - new Date((parsed as StoredChallengeEnvelope).updatedAt).getTime() <=
            STORE_TTL_MS
        ? (parsed as StoredChallengeEnvelope).records
        : [];
    return records
      .map(migrateRecord)
      .filter((record): record is ChallengeRecord => record !== null);
  } catch {
    return [];
  }
}

function criterion(id: string, title: string, target: string, method: string) {
  return { id, title, target, method };
}

function seedRecords(): ChallengeRecord[] {
  return [
    {
      ...completeSeed("CH-1405-021", "2026-08-02T08:15:00.000Z"),
      status: "published",
      title: "بازیابی هوشمند آب در خط شست‌وشوی صنعتی",
      summary: "مصرف آب خط شست‌وشو از معیار طراحی بالاتر است و بازیافت مؤثری انجام نمی‌شود.",
      category: "آب و محیط‌زیست",
      location: "سایت تولید اصفهان، خط شست‌وشوی ۲",
      desiredOutcome: "کاهش حداقل ۲۵ درصدی مصرف آب بدون افت کیفیت شست‌وشو",
      currentState: "خط در هر شیفت حدود ۱۲۰ مترمکعب آب تازه مصرف می‌کند.",
      expectedOutput: "طراحی راهکار و برنامه اجرای پایلوت روی یک خط",
      inScope: "مدار آب خط ۲، تجهیزات پایش و روش‌های بازچرخانی",
      successCriteria: [
        criterion(
          "SC-WATER",
          "کاهش مصرف آب تازه",
          "حداقل ۲۵ درصد",
          "مقایسه کنتور ورودی در دو دوره چهار‌هفته‌ای",
        ),
      ],
      submittedAt: "2026-08-05T09:00:00.000Z",
      lastStep: 4,
    },
    {
      ...completeSeed("CH-1405-034", "2026-07-28T10:30:00.000Z"),
      status: "under_review",
      title: "پایش هوشمند خوردگی تجهیزات",
      summary: "بازرسی دوره‌ای فعلی تغییرات سریع خوردگی در تجهیزات فرایندی را دیر تشخیص می‌دهد.",
      category: "نگهداری و پایش تجهیزات",
      location: "مجتمع فرایندی بندرعباس",
      desiredOutcome: "تشخیص زودهنگام نقاط پرریسک و کاهش توقف ناخواسته",
      currentState: "اندازه‌گیری‌ها دستی و با فاصله زمانی سه‌ماهه انجام می‌شوند.",
      expectedOutput: "نمونه اولیه سامانه پایش و داشبورد هشدار",
      inScope: "شش تجهیز منتخب، حسگرها و یکپارچه‌سازی داده پایش",
      successCriteria: [
        criterion(
          "SC-CORROSION",
          "زمان تشخیص تغییر",
          "کمتر از ۲۴ ساعت",
          "ثبت رخداد کنترل‌شده و مقایسه زمان هشدار",
        ),
      ],
      outputType: "poc",
      submittedAt: "2026-07-30T11:10:00.000Z",
      updatedAt: "2026-07-30T11:10:00.000Z",
    },
    {
      ...completeSeed("CH-1405-041", "2026-06-14T07:45:00.000Z"),
      status: "published",
      title: "بهینه‌سازی بازیافت حرارت",
      summary: "بخشی از حرارت گازهای خروجی کوره بدون استفاده از فرایند خارج می‌شود.",
      category: "انرژی و بهره‌وری",
      location: "کارخانه مرکزی، واحد حرارتی",
      desiredOutcome: "کاهش مصرف سوخت کوره با بازیافت پایدار حرارت اتلافی",
      currentState: "دمای گاز خروجی در بار نامی به‌طور متوسط ۳۸۰ درجه است.",
      expectedOutput: "طراحی مهندسی و برآورد اقتصادی راهکار منتخب",
      inScope: "کوره شماره ۱، مبدل و مسیرهای انتقال حرارت",
      successCriteria: [
        criterion(
          "SC-HEAT",
          "کاهش مصرف سوخت",
          "حداقل ۱۲ درصد",
          "تراز انرژی پیش و پس از اجرای آزمایشی",
        ),
      ],
      outputType: "solution",
      submittedAt: "2026-06-18T09:20:00.000Z",
      updatedAt: "2026-07-21T12:00:00.000Z",
    },
    {
      ...emptyChallenge("CH-1405-052", "2026-08-04T14:25:00.000Z"),
      status: "ready",
      title: "کاهش ضایعات بسته‌بندی",
      summary: "تغییرات تنظیمات دستگاه باعث افزایش بسته‌های خارج از مشخصات در شروع هر شیفت می‌شود.",
      category: "زنجیره تأمین و بسته‌بندی",
      location: "سایت کرج، سالن بسته‌بندی",
      desiredOutcome: "کاهش ضایعات شروع شیفت به کمتر از یک درصد تولید",
      currentState: "در ۲۰ دقیقه نخست هر شیفت به‌طور متوسط ۳.۸ درصد محصول حذف می‌شود.",
      consequence: "افزایش مصرف مواد، زمان توقف و هزینه دفع ضایعات",
      expectedOutput: "راهکار پایش تنظیمات و دستورالعمل اجرای پایلوت",
      inScope: "دو دستگاه بسته‌بندی پرحجم و داده‌های سه ماه اخیر",
      organizationSupport: "داده توقف‌ها، دسترسی به دستگاه و همراهی سرپرست شیفت",
      successCriteria: [
        criterion(
          "SC-PACK",
          "ضایعات شروع شیفت",
          "کمتر از ۱ درصد",
          "وزن‌کشی و ثبت ضایعات در ۲۰ شیفت",
        ),
      ],
      outputType: "pilot",
      sourcingModel: "hybrid",
      solverTypes: ["team", "company", "university"],
      applicantScope: "both",
      workMode: "hybrid",
      proposalDeadline: "2026-09-20",
      budgetStatus: "quote",
      visibility: "registered",
      publicSummary: "طراحی راهکاری برای کاهش ضایعات ناشی از تنظیم اولیه تجهیزات بسته‌بندی",
      ipTerms: "contract_transfer",
      accuracyConfirmed: true,
      lastStep: 4,
    },
  ];
}

function completeSeed(id: string, createdAt: string): ChallengeRecord {
  return {
    ...emptyChallenge(id, createdAt),
    consequence: "ادامه وضعیت موجود باعث افزایش توقف و هزینه نگهداری می‌شود.",
    constraints: "راهکار باید با الزامات ایمنی سایت و توقف محدود تجهیزات سازگار باشد.",
    organizationSupport: "داده‌های پایه و دسترسی کنترل‌شده به تجهیزات فراهم می‌شود.",
    outputType: "poc",
    sourcingModel: "public",
    solverTypes: ["team", "company", "university"],
    applicantScope: "both",
    workMode: "hybrid",
    proposalDeadline: "2026-10-01",
    preferredStartDate: "2026-10-20",
    budgetStatus: "quote",
    visibility: "registered",
    publicSummary: "یک مسئله صنعتی برای دریافت و ارزیابی راهکارهای قابل اجرا",
    ndaRequired: true,
    ipTerms: "joint_contract",
    accuracyConfirmed: true,
    lastStep: 4,
  };
}

export function emptyChallenge(id: string, now = new Date().toISOString()): ChallengeRecord {
  return {
    id,
    status: "draft",
    title: "",
    summary: "",
    category: "",
    location: "",
    ownerName: currentUser.name,
    desiredOutcome: "",
    urgency: "normal",
    attachments: [],
    currentState: "",
    consequence: "",
    expectedOutput: "",
    successCriteria: [],
    inScope: "",
    constraints: "",
    organizationSupport: "",
    previousAttempts: "",
    outputType: "",
    sourcingModel: "",
    solverTypes: [],
    applicantScope: "",
    workMode: "",
    proposalDeadline: "",
    preferredStartDate: "",
    budgetStatus: "",
    budgetAmount: "",
    currency: "IRR",
    invitees: "",
    visibility: "",
    publicSummary: "",
    ndaRequired: false,
    ipTerms: "",
    contactName: currentUser.name,
    contactEmail: currentUser.email,
    contactPhone: currentUser.phone,
    accuracyConfirmed: false,
    legalNotes: "",
    createdAt: now,
    updatedAt: now,
    lastStep: 1,
  };
}

function writeRecords(records: ChallengeRecord[]) {
  if (!canUseStorage()) return;
  const envelope: ChallengeStoreEnvelope = {
    version: STORE_VERSION,
    updatedAt: new Date().toISOString(),
    records,
  };
  const legacyRecords = records.map(({ applicantScope, ...record }) => ({
    ...record,
    teamType: applicantScope,
  }));
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
  // Demo-only one-version rollback mirror. Remove after the v8 migration window closes.
  window.localStorage.setItem(PREVIOUS_STORAGE_KEY, JSON.stringify(legacyRecords));
  window.localStorage.setItem(SEEDED_KEY, "true");
  window.dispatchEvent(new CustomEvent("rahhal:challenges"));
}

function ensureSeedData() {
  if (!canUseStorage()) return;
  const current = parseRecords(window.localStorage.getItem(STORAGE_KEY));
  if (current.length) return;
  const legacy = [PREVIOUS_STORAGE_KEY, LEGACY_STORAGE_KEY]
    .map((key) => parseRecords(window.localStorage.getItem(key)))
    .find((records) => records.length);
  if (legacy?.length) {
    writeRecords(legacy);
    return;
  }
  writeRecords(seedRecords());
}

export function listChallenges(): ChallengeRecord[] {
  if (!canUseStorage()) return [];
  ensureSeedData();
  return parseRecords(window.localStorage.getItem(STORAGE_KEY)).sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
}

export function getChallenge(id: string) {
  return listChallenges().find((record) => record.id === id);
}

export function saveChallenge(record: ChallengeRecord) {
  if (!canUseStorage()) return record;
  const saved = { ...record, updatedAt: new Date().toISOString() };
  writeRecords([saved, ...listChallenges().filter((item) => item.id !== record.id)]);
  return saved;
}

export type InitialChallengeInput = Pick<
  ChallengeRecord,
  | "title"
  | "summary"
  | "category"
  | "location"
  | "ownerName"
  | "desiredOutcome"
  | "urgency"
  | "attachments"
>;

export function createChallenge(input: InitialChallengeInput) {
  const usedIds = new Set(listChallenges().map((record) => record.id));
  const id = DRAFT_ID_POOL.find((candidate) => !usedIds.has(candidate));
  if (!id) throw new Error("ظرفیت پیش‌نویس‌های نسخه نمایشی تکمیل است؛ یک پیش‌نویس را حذف کنید.");
  return saveChallenge({ ...emptyChallenge(id), ...input, lastStep: 1 });
}

export function deleteChallenge(id: string) {
  const record = getChallenge(id);
  if (!record || !["draft", "ready", "needs_changes"].includes(record.status)) return false;
  writeRecords(listChallenges().filter((item) => item.id !== id));
  return true;
}

export function submitChallenge(record: ChallengeRecord) {
  if (!isRecordReady(record)) {
    throw new Error("اطلاعات مسئله کامل نیست؛ خطاهای پیش‌نمایش را رفع و دوباره ارسال کنید.");
  }
  const submittedAt = new Date().toISOString();
  return saveChallenge({ ...record, status: "under_review", submittedAt, lastStep: 4 });
}

export function publishChallenge(id: string) {
  const record = getChallenge(id);
  if (!record || record.status !== "under_review" || !isRecordReady(record)) return null;
  return saveChallenge({ ...record, status: "published", lastStep: 4 });
}

export function updateRecordStatus(record: ChallengeRecord, status: ChallengeStatus) {
  return saveChallenge({ ...record, status });
}

export function createAttachment(file: File): Attachment {
  return {
    id: `AT-${Date.now().toString(36)}`,
    name: safeUploadName(file.name),
    size: file.size,
    type: file.type || "application/octet-stream",
    addedAt: new Date().toISOString(),
  };
}

export function resetChallengeDemoData() {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.localStorage.removeItem(PREVIOUS_STORAGE_KEY);
  window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  window.localStorage.removeItem(SEEDED_KEY);
  window.localStorage.removeItem(PREVIOUS_SEEDED_KEY);
  ensureSeedData();
}

// Prototype compatibility: the challenge module already assumes the signed-in
// organizational demo user, so existing authentication demo routes need no
// additional session state before returning to the canonical flow.
export function signInAsAuthorizedOrganization() {
  ensureSeedData();
  createDemoSession("org", "org-mapna");
}

export function formatDateTime(value?: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("fa-IR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

declare global {
  interface Window {
    rahhalChallengeDemo?: { reset: () => void };
  }
}

if (typeof window !== "undefined") {
  window.rahhalChallengeDemo = { reset: resetChallengeDemoData };
}
