import {
  budgetStatusLabels,
  challengeStatuses,
  ipTermLabels,
  outputTypeLabels,
  sourcingModelLabels,
  visibilityLabels,
  workModeLabels,
  type ChallengeRecord,
  type ChallengeStatus,
} from "@/domain/challenge";
import { applicantScopeForTypes, isApplicantType, type ApplicantType } from "@/domain/taxonomy";
import type { InitialChallengeInput } from "@/lib/challenges/gateway";
import { DRAFT_ID_POOL } from "@/lib/challenges/ids";
import { emptyChallenge } from "@/lib/challenges/model";
import { isRecordReady } from "@/lib/challenges/validation";

const STORAGE_KEY = "rahhal.organization-challenges.v9";
const PREVIOUS_STORAGE_KEY = "rahhal.organization-challenges.v8";
const PREVIOUS_STORAGE_FRESH_KEY = "rahhal.organization-challenges.v8.mirror-fresh";
const LEGACY_STORAGE_KEY = "rahhal.organization-challenges.v7";
const LEGACY_STORAGE_FRESH_KEY = "rahhal.organization-challenges.v7.mirror-fresh";
const OLDEST_STORAGE_KEY = "rahhal.organization-challenges.v6";
const SEEDED_KEY = "rahhal.organization-challenges.seeded.v9";
const PREVIOUS_SEEDED_KEY = "rahhal.organization-challenges.seeded.v8";
const LEGACY_SEEDED_KEY = "rahhal.organization-challenges.seeded.v7";
const STORE_VERSION = 9;
const PREVIOUS_STORE_VERSION = 8;
const LEGACY_STORE_VERSION = 7;
const STORE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export const challengeDemoMessages = {
  draftCapacity: "ظرفیت پیش‌نویس‌های نسخه نمایشی تکمیل است؛ یک پیش‌نویس را حذف کنید.",
  incomplete: "اطلاعات مسئله کامل نیست؛ خطاهای پیش‌نمایش را رفع و دوباره ارسال کنید.",
} as const;

type ChallengeStoreEnvelope = {
  version: typeof STORE_VERSION;
  updatedAt: string;
  records: ChallengeRecord[];
};

type StoredChallengeEnvelope = {
  version: typeof STORE_VERSION | typeof PREVIOUS_STORE_VERSION | typeof LEGACY_STORE_VERSION;
  updatedAt: string;
  records: unknown[];
};

export class ChallengeDemoStorageError extends Error {
  constructor(
    public readonly operation: "read" | "write" | "remove",
    options?: ErrorOptions,
  ) {
    super("Challenge demo storage operation failed.", options);
    this.name = "ChallengeDemoStorageError";
  }
}

export function isChallengeDemoStorageAvailable() {
  if (typeof window === "undefined") return false;
  try {
    return Boolean(window.localStorage);
  } catch {
    return false;
  }
}

function readStorageItem(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch (cause) {
    throw new ChallengeDemoStorageError("read", { cause });
  }
}

function writeStorageItem(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch (cause) {
    throw new ChallengeDemoStorageError("write", { cause });
  }
}

function removeStorageItem(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch (cause) {
    throw new ChallengeDemoStorageError("remove", { cause });
  }
}

function previousStoreFreshness(records: ChallengeRecord[]) {
  return JSON.stringify(
    records
      .map(({ id, updatedAt }) => [id, updatedAt] as const)
      .sort(([leftId], [rightId]) => leftId.localeCompare(rightId)),
  );
}

function clearPreviousStoreSnapshotBestEffort() {
  for (const key of [PREVIOUS_STORAGE_KEY, PREVIOUS_STORAGE_FRESH_KEY]) {
    try {
      removeStorageItem(key);
    } catch (error) {
      if (!(error instanceof ChallengeDemoStorageError)) throw error;
    }
  }
}

function clearLegacyMigrationSourcesBestEffort() {
  for (const key of [
    LEGACY_STORAGE_KEY,
    LEGACY_STORAGE_FRESH_KEY,
    OLDEST_STORAGE_KEY,
    LEGACY_SEEDED_KEY,
  ]) {
    try {
      removeStorageItem(key);
    } catch (error) {
      if (!(error instanceof ChallengeDemoStorageError)) throw error;
    }
  }
}

function refreshPreviousStoreSnapshot(records: ChallengeRecord[], serializedRecords: string) {
  try {
    // Invalidate first so an interrupted mirror refresh cannot be treated as complete.
    removeStorageItem(PREVIOUS_STORAGE_FRESH_KEY);
    if (readStorageItem(PREVIOUS_STORAGE_KEY) !== serializedRecords) {
      writeStorageItem(PREVIOUS_STORAGE_KEY, serializedRecords);
    }
    writeStorageItem(PREVIOUS_STORAGE_FRESH_KEY, previousStoreFreshness(records));
  } catch (error) {
    if (!(error instanceof ChallengeDemoStorageError)) throw error;
    clearPreviousStoreSnapshotBestEffort();
  }
}

function markSeededBestEffort() {
  try {
    writeStorageItem(SEEDED_KEY, "true");
  } catch (error) {
    if (!(error instanceof ChallengeDemoStorageError)) throw error;
  }
}

const legacyApplicantTypeMap = {
  individual: "individual",
  team: "expert-team",
  company: "company",
  university: "academic-group",
} as const satisfies Record<string, ApplicantType>;

type LegacyApplicantType = keyof typeof legacyApplicantTypeMap;

type ApplicantTypeMigration = {
  valid: boolean;
  values: ApplicantType[];
};

function canonicalApplicantTypes(stored: Record<string, unknown>): ApplicantTypeMigration {
  const hasCanonicalField = Object.prototype.hasOwnProperty.call(stored, "allowedApplicantTypes");
  const source = hasCanonicalField ? stored.allowedApplicantTypes : stored.solverTypes;
  if (source === undefined) return { valid: true, values: [] };
  if (!Array.isArray(source) || source.some((value) => typeof value !== "string")) {
    return { valid: false, values: [] };
  }
  const values = hasCanonicalField
    ? source.filter(isApplicantType)
    : source.flatMap((value) => {
        if (!Object.prototype.hasOwnProperty.call(legacyApplicantTypeMap, value)) return [];
        return [legacyApplicantTypeMap[value as LegacyApplicantType]];
      });
  return { valid: true, values: [...new Set(values)] };
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isDateTime(value: unknown): value is string {
  return isNonEmptyString(value) && Number.isFinite(new Date(value).getTime());
}

function hasOption(options: object, value: unknown) {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(options, value);
}

function isAttachment(value: unknown): value is ChallengeRecord["attachments"][number] {
  return (
    isObjectRecord(value) &&
    isNonEmptyString(value.id) &&
    typeof value.name === "string" &&
    typeof value.size === "number" &&
    Number.isFinite(value.size) &&
    value.size >= 0 &&
    typeof value.type === "string" &&
    isDateTime(value.addedAt)
  );
}

function isSuccessCriterion(value: unknown): value is ChallengeRecord["successCriteria"][number] {
  return (
    isObjectRecord(value) &&
    isNonEmptyString(value.id) &&
    typeof value.title === "string" &&
    typeof value.target === "string" &&
    typeof value.method === "string"
  );
}

const challengeStringFields = [
  "title",
  "summary",
  "category",
  "location",
  "ownerName",
  "desiredOutcome",
  "currentState",
  "consequence",
  "expectedOutput",
  "inScope",
  "constraints",
  "organizationSupport",
  "previousAttempts",
  "proposalDeadline",
  "preferredStartDate",
  "budgetAmount",
  "invitees",
  "publicSummary",
  "contactName",
  "contactEmail",
  "contactPhone",
  "legalNotes",
] as const satisfies readonly (keyof ChallengeRecord)[];

function isChallengeRecord(value: Record<string, unknown>): value is ChallengeRecord {
  return (
    isNonEmptyString(value.id) &&
    hasOption(challengeStatuses, value.status) &&
    challengeStringFields.every((field) => typeof value[field] === "string") &&
    ["normal", "important", "urgent"].includes(value.urgency as string) &&
    Array.isArray(value.attachments) &&
    value.attachments.every(isAttachment) &&
    Array.isArray(value.successCriteria) &&
    value.successCriteria.every(isSuccessCriterion) &&
    (value.outputType === "" || hasOption(outputTypeLabels, value.outputType)) &&
    (value.sourcingModel === "" || hasOption(sourcingModelLabels, value.sourcingModel)) &&
    Array.isArray(value.allowedApplicantTypes) &&
    value.allowedApplicantTypes.every(isApplicantType) &&
    value.applicantScope ===
      (applicantScopeForTypes(value.allowedApplicantTypes as ApplicantType[]) ?? "") &&
    (value.workMode === "" || hasOption(workModeLabels, value.workMode)) &&
    (value.budgetStatus === "" || hasOption(budgetStatusLabels, value.budgetStatus)) &&
    ["IRR", "USD", "EUR"].includes(value.currency as string) &&
    (value.visibility === "" || hasOption(visibilityLabels, value.visibility)) &&
    typeof value.ndaRequired === "boolean" &&
    (value.ipTerms === "" || hasOption(ipTermLabels, value.ipTerms)) &&
    typeof value.accuracyConfirmed === "boolean" &&
    [1, 2, 3, 4].includes(value.lastStep as number) &&
    isDateTime(value.createdAt) &&
    isDateTime(value.updatedAt) &&
    (value.submittedAt === undefined || isDateTime(value.submittedAt))
  );
}

function migrateRecord(value: unknown): ChallengeRecord | null {
  if (!isObjectRecord(value)) return null;
  const stored = value;
  const applicantTypes = canonicalApplicantTypes(stored);
  if (!applicantTypes.valid) return null;
  const record = { ...stored };
  delete record.teamType;
  delete record.solverTypes;
  const normalized = {
    ...record,
    applicantScope: applicantScopeForTypes(applicantTypes.values) ?? "",
    allowedApplicantTypes: applicantTypes.values,
  };
  return isChallengeRecord(normalized) ? normalized : null;
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
            (parsed as StoredChallengeEnvelope).version === PREVIOUS_STORE_VERSION ||
            (parsed as StoredChallengeEnvelope).version === LEGACY_STORE_VERSION) &&
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

function storedRecordsDiffer(raw: string, records: readonly ChallengeRecord[]): boolean {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return (
      !parsed ||
      typeof parsed !== "object" ||
      !Array.isArray((parsed as StoredChallengeEnvelope).records) ||
      JSON.stringify((parsed as StoredChallengeEnvelope).records) !== JSON.stringify(records)
    );
  } catch {
    return true;
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
      allowedApplicantTypes: ["expert-team", "company", "academic-group"],
      applicantScope: "team",
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
    allowedApplicantTypes: ["expert-team", "company", "academic-group"],
    applicantScope: "team",
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

const previousApplicantTypeMap: Partial<Record<ApplicantType, LegacyApplicantType>> = {
  individual: "individual",
  "expert-team": "team",
  company: "company",
  "academic-group": "university",
};

function previousStoreRecord(record: ChallengeRecord) {
  const { allowedApplicantTypes, ...previousRecord } = record;
  return {
    ...previousRecord,
    solverTypes: allowedApplicantTypes.flatMap((applicantType) => {
      const previousApplicantType = previousApplicantTypeMap[applicantType];
      return previousApplicantType ? [previousApplicantType] : [];
    }),
  };
}

function writeRecords(records: ChallengeRecord[]) {
  if (!isChallengeDemoStorageAvailable()) return;
  const updatedAt = new Date().toISOString();
  const envelope: ChallengeStoreEnvelope = {
    version: STORE_VERSION,
    updatedAt,
    records,
  };
  const previousEnvelope: StoredChallengeEnvelope = {
    version: PREVIOUS_STORE_VERSION,
    updatedAt,
    records: records.map(previousStoreRecord),
  };
  writeStorageItem(STORAGE_KEY, JSON.stringify(envelope));
  // The demo-only v8 rollback mirror is all-or-nothing: v8 has no safe representation for `lab`.
  if (records.some((record) => record.allowedApplicantTypes.includes("lab"))) {
    clearPreviousStoreSnapshotBestEffort();
  } else {
    refreshPreviousStoreSnapshot(records, JSON.stringify(previousEnvelope));
  }
  markSeededBestEffort();
  clearLegacyMigrationSourcesBestEffort();
  window.dispatchEvent(new CustomEvent("rahhal:challenges"));
}

function ensureSeedData() {
  if (!isChallengeDemoStorageAvailable()) return;
  const currentRaw = readStorageItem(STORAGE_KEY);
  const current = parseRecords(currentRaw);
  if (current.length) {
    if (currentRaw && storedRecordsDiffer(currentRaw, current)) writeRecords(current);
    return;
  }
  const currentIsMissing = currentRaw === null;
  const currentWasSeen = readStorageItem(SEEDED_KEY) === "true";
  const previousRaw = readStorageItem(PREVIOUS_STORAGE_KEY);
  const previous = parseRecords(previousRaw);
  const previousIsFresh =
    previous.length > 0 &&
    (currentIsMissing && !currentWasSeen
      ? true
      : readStorageItem(PREVIOUS_STORAGE_FRESH_KEY) === previousStoreFreshness(previous));
  if (previousIsFresh) {
    writeRecords(previous);
    return;
  }
  if (!currentIsMissing || currentWasSeen) {
    writeRecords(seedRecords());
    return;
  }

  const legacyRaw = readStorageItem(LEGACY_STORAGE_KEY);
  const legacy = parseRecords(legacyRaw);
  const legacyIsFresh =
    legacy.length > 0 &&
    (previousRaw === null ||
      readStorageItem(LEGACY_STORAGE_FRESH_KEY) === previousStoreFreshness(legacy));
  if (legacyIsFresh) {
    writeRecords(legacy);
    return;
  }
  if (previousRaw !== null || legacyRaw !== null) {
    writeRecords(seedRecords());
    return;
  }

  const oldest = parseRecords(readStorageItem(OLDEST_STORAGE_KEY));
  if (oldest.length) {
    writeRecords(oldest);
    return;
  }
  writeRecords(seedRecords());
}

export function listChallenges(): ChallengeRecord[] {
  if (!isChallengeDemoStorageAvailable()) return [];
  ensureSeedData();
  return parseRecords(readStorageItem(STORAGE_KEY)).sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
}

export function getChallenge(id: string) {
  return listChallenges().find((record) => record.id === id);
}

export function saveChallenge(record: ChallengeRecord) {
  if (!isChallengeDemoStorageAvailable()) return record;
  const applicantScope: ChallengeRecord["applicantScope"] =
    applicantScopeForTypes(record.allowedApplicantTypes) ?? "";
  const saved: ChallengeRecord = {
    ...record,
    applicantScope,
    updatedAt: new Date().toISOString(),
  };
  writeRecords([saved, ...listChallenges().filter((item) => item.id !== record.id)]);
  return saved;
}

export function createChallenge(input: InitialChallengeInput) {
  const usedIds = new Set(listChallenges().map((record) => record.id));
  const id = DRAFT_ID_POOL.find((candidate) => !usedIds.has(candidate));
  if (!id) throw new Error(challengeDemoMessages.draftCapacity);
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
    throw new Error(challengeDemoMessages.incomplete);
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

export function resetChallengeDemoData() {
  if (!isChallengeDemoStorageAvailable()) return;
  removeStorageItem(STORAGE_KEY);
  removeStorageItem(PREVIOUS_STORAGE_KEY);
  removeStorageItem(PREVIOUS_STORAGE_FRESH_KEY);
  removeStorageItem(LEGACY_STORAGE_KEY);
  removeStorageItem(LEGACY_STORAGE_FRESH_KEY);
  removeStorageItem(OLDEST_STORAGE_KEY);
  removeStorageItem(SEEDED_KEY);
  removeStorageItem(PREVIOUS_SEEDED_KEY);
  removeStorageItem(LEGACY_SEEDED_KEY);
  ensureSeedData();
}

declare global {
  interface Window {
    rahhalChallengeDemo?: { reset: () => void };
  }
}

if (typeof window !== "undefined") {
  window.rahhalChallengeDemo = { reset: resetChallengeDemoData };
}
