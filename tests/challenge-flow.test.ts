// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import type { ChallengeRecord } from "@/domain/challenge";
import { challengeFlowStaticPaths, getChallengeFlowRoute } from "@/data/challenge-flow-routes";
import {
  createChallenge,
  deleteChallenge,
  getChallenge,
  listChallenges,
  resetChallengeDemoData,
  saveChallenge,
  submitChallenge,
} from "@/lib/challenges/storage";
import { emptyChallenge } from "@/lib/challenges/model";
import {
  isRecordReady,
  normalizedEditableRecord,
  validateRecord,
  validateStep,
} from "@/lib/challenges/validation";

function createBase() {
  return createChallenge({
    title: "کاهش توقف ناخواسته تجهیزات خط تولید",
    summary: "توقف‌های تکرارشونده برنامه تولید را مختل و هزینه نگهداری را افزایش داده است.",
    category: "تولید و عملیات",
    location: "کارخانه مرکزی، خط تولید شماره دو",
    ownerName: "سارا نادری",
    desiredOutcome: "کاهش قابل‌اندازه‌گیری توقف ناخواسته و افزایش دسترس‌پذیری خط تولید",
    urgency: "important",
    attachments: [],
  });
}

function completeRecord(base: ChallengeRecord): ChallengeRecord {
  return {
    ...base,
    currentState: "خط پایه سه‌ماهه نشان می‌دهد میانگین توقف ناخواسته هر هفته شش ساعت است.",
    consequence: "ادامه وضعیت فعلی ظرفیت تولید و هزینه نگهداری را تحت تأثیر قرار می‌دهد.",
    expectedOutput: "راهکار پایش و برنامه آزمون پذیرش در محیط واقعی",
    successCriteria: [
      {
        id: "SC-1",
        title: "توقف هفتگی",
        target: "کمتر از چهار ساعت",
        method: "گزارش سامانه نگهداری",
      },
    ],
    inScope: "تجهیزات بحرانی خط دو و داده‌های سه‌ماهه نگهداری",
    constraints: "حداکثر چهار ساعت توقف نصب و سازگاری با شبکه موجود",
    organizationSupport: "داده تاریخی و دسترسی کنترل‌شده به تجهیز",
    outputType: "poc",
    sourcingModel: "public",
    allowedApplicantTypes: ["expert-team", "company"],
    applicantScope: "team",
    workMode: "hybrid",
    proposalDeadline: "2026-10-01",
    preferredStartDate: "2026-10-20",
    budgetStatus: "quote",
    visibility: "registered",
    publicSummary: "طراحی و آزمون یک راهکار برای کاهش توقف ناخواسته تجهیزات تولید",
    ndaRequired: true,
    ipTerms: "joint_contract",
    contactName: "سارا نادری",
    contactEmail: "s.naderi@example.ir",
    contactPhone: "09121234567",
    accuracyConfirmed: true,
    lastStep: 4,
  };
}

beforeEach(() => window.localStorage.clear());

describe("Repository و Persistence ماژول مسئله‌ها", () => {
  it("چهار رکورد واقعی اولیه و شناسه یکتای پیش‌نویس می‌سازد", () => {
    expect(listChallenges()).toHaveLength(4);
    const first = createBase();
    const second = createBase();
    expect(first.id).toBe("CH-DRAFT-001");
    expect(second.id).toBe("CH-DRAFT-002");
    expect(listChallenges()).toHaveLength(6);
  });

  it("ذخیره و بازیابی پس از خواندن دوباره LocalStorage پایدار است", () => {
    const record = createBase();
    saveChallenge({ ...record, category: "انرژی و بهره‌وری" });
    expect(getChallenge(record.id)?.category).toBe("انرژی و بهره‌وری");
  });

  it("رکورد v8 را به ApplicantType مهاجرت و mirror قابل بازگشت می‌نویسد", () => {
    const legacyRecord = {
      ...emptyChallenge("CH-DRAFT-001", "2026-08-20T10:00:00.000Z"),
      applicantScope: "team",
      solverTypes: ["individual", "team", "company", "university"],
    } as Record<string, unknown>;
    delete legacyRecord.allowedApplicantTypes;
    window.localStorage.setItem(
      "rahhal.organization-challenges.v8",
      JSON.stringify({
        version: 8,
        updatedAt: new Date().toISOString(),
        records: [legacyRecord],
      }),
    );

    expect(listChallenges()[0]).toMatchObject({
      id: "CH-DRAFT-001",
      applicantScope: "both",
      allowedApplicantTypes: ["individual", "expert-team", "company", "academic-group"],
    });
    expect(listChallenges()[0]).not.toHaveProperty("solverTypes");

    const current = JSON.parse(
      window.localStorage.getItem("rahhal.organization-challenges.v9") ?? "null",
    );
    expect(current).toMatchObject({
      version: 9,
      records: [
        expect.objectContaining({
          applicantScope: "both",
          allowedApplicantTypes: ["individual", "expert-team", "company", "academic-group"],
        }),
      ],
    });
    const rollbackMirror = JSON.parse(
      window.localStorage.getItem("rahhal.organization-challenges.v8") ?? "null",
    );
    expect(rollbackMirror).toMatchObject({
      version: 8,
      records: [
        expect.objectContaining({
          applicantScope: "both",
          solverTypes: ["individual", "team", "company", "university"],
        }),
      ],
    });
    expect(rollbackMirror.records[0]).not.toHaveProperty("allowedApplicantTypes");
  });

  it("دامنه متناقض v9 را از مجموعه مجاز مشتق و همان‌جا بازنویسی می‌کند", () => {
    const contradictory = {
      ...emptyChallenge("CH-DRAFT-001", "2026-08-20T10:00:00.000Z"),
      allowedApplicantTypes: ["expert-team", "company"],
      applicantScope: "both",
    };
    window.localStorage.setItem(
      "rahhal.organization-challenges.v9",
      JSON.stringify({
        version: 9,
        updatedAt: new Date().toISOString(),
        records: [contradictory],
      }),
    );

    expect(listChallenges()[0]).toMatchObject({ applicantScope: "team" });
    const persisted = JSON.parse(
      window.localStorage.getItem("rahhal.organization-challenges.v9") ?? "null",
    );
    expect(persisted.records[0]).toMatchObject({ applicantScope: "team" });
  });

  it("در رکورد mixed، فیلد canonical بر legacy مقدم است", () => {
    const mixedRecord = {
      ...emptyChallenge("CH-DRAFT-001", "2026-08-20T10:00:00.000Z"),
      allowedApplicantTypes: ["lab"],
      solverTypes: ["individual", "team", "company", "university"],
    };
    window.localStorage.setItem(
      "rahhal.organization-challenges.v9",
      JSON.stringify({
        version: 9,
        updatedAt: new Date().toISOString(),
        records: [mixedRecord],
      }),
    );

    const migrated = listChallenges()[0];
    expect(migrated.allowedApplicantTypes).toEqual(["lab"]);
    expect(migrated).not.toHaveProperty("solverTypes");
  });

  it("v7 را فقط در مهاجرت اولیه با نگاشت قطعی taxonomy می‌خواند", () => {
    const legacyRecord = {
      ...emptyChallenge("CH-DRAFT-001", "2026-08-20T10:00:00.000Z"),
      teamType: "team",
      solverTypes: ["team", "university"],
    } as Record<string, unknown>;
    delete legacyRecord.applicantScope;
    delete legacyRecord.allowedApplicantTypes;
    window.localStorage.setItem(
      "rahhal.organization-challenges.v7",
      JSON.stringify({
        version: 7,
        updatedAt: new Date().toISOString(),
        records: [legacyRecord],
      }),
    );

    expect(listChallenges()[0]).toMatchObject({
      id: "CH-DRAFT-001",
      applicantScope: "team",
      allowedApplicantTypes: ["expert-team", "academic-group"],
    });
  });

  it("وجود lab کل mirror v8 را نامعتبر می‌کند و بازیابی ناقص انجام نمی‌شود", () => {
    const record = createBase();
    saveChallenge({
      ...record,
      allowedApplicantTypes: ["lab", "academic-group"],
    });

    expect(window.localStorage.getItem("rahhal.organization-challenges.v8")).toBeNull();
    expect(
      window.localStorage.getItem("rahhal.organization-challenges.v8.mirror-fresh"),
    ).toBeNull();
    expect(window.localStorage.getItem("rahhal.organization-challenges.seeded.v9")).toBe("true");

    window.localStorage.setItem("rahhal.organization-challenges.v9", "{corrupt-current");
    expect(getChallenge(record.id)).toBeUndefined();
  });

  it("پس از مشاهده v9 گم‌شده، v7/v6 باقی‌مانده را منبع مهاجرت تازه نمی‌داند", () => {
    const legacyRecord = {
      ...emptyChallenge("CH-DRAFT-001", "2026-08-20T10:00:00.000Z"),
      title: "نسخه قدیمی",
      solverTypes: ["team"],
    } as Record<string, unknown>;
    delete legacyRecord.allowedApplicantTypes;
    window.localStorage.setItem(
      "rahhal.organization-challenges.v7",
      JSON.stringify({
        version: 7,
        updatedAt: new Date().toISOString(),
        records: [legacyRecord],
      }),
    );
    const migrated = getChallenge("CH-DRAFT-001");
    if (!migrated) throw new Error("legacy challenge missing");
    saveChallenge({ ...migrated, title: "نسخه جدید", allowedApplicantTypes: ["lab"] });
    expect(window.localStorage.getItem("rahhal.organization-challenges.v7")).toBeNull();
    expect(window.localStorage.getItem("rahhal.organization-challenges.seeded.v9")).toBe("true");

    window.localStorage.setItem(
      "rahhal.organization-challenges.v7",
      JSON.stringify([legacyRecord]),
    );
    window.localStorage.setItem(
      "rahhal.organization-challenges.v6",
      JSON.stringify([legacyRecord]),
    );
    window.localStorage.removeItem("rahhal.organization-challenges.v9");

    expect(getChallenge("CH-DRAFT-001")).toBeUndefined();
    expect(listChallenges().some(({ title }) => title === "نسخه قدیمی")).toBe(false);
  });

  it("مقدار ApplicantType legacy ناشناخته را مجاز تلقی نمی‌کند", () => {
    const legacyRecord = {
      ...emptyChallenge("CH-DRAFT-001", "2026-08-20T10:00:00.000Z"),
      teamType: "organization",
      solverTypes: ["laboratory", "toString"],
    } as Record<string, unknown>;
    delete legacyRecord.applicantScope;
    delete legacyRecord.allowedApplicantTypes;
    window.localStorage.setItem(
      "rahhal.organization-challenges.v6",
      JSON.stringify([legacyRecord]),
    );

    const migrated = listChallenges()[0];
    expect(migrated.applicantScope).toBe("");
    expect(migrated.allowedApplicantTypes).toEqual([]);
    expect(validateStep(migrated, 3)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "allowedApplicantTypes", step: 3 }),
      ]),
    );
  });

  it("بازنشانی زنجیره v9 تا v6 را پاک می‌کند و داده قدیمی را برنمی‌گرداند", () => {
    const legacyRecord = {
      ...emptyChallenge("CH-DRAFT-001", "2026-08-20T10:00:00.000Z"),
      title: "رکورد قدیمی کاربر",
      teamType: "person",
    } as Record<string, unknown>;
    delete legacyRecord.applicantScope;
    window.localStorage.setItem(
      "rahhal.organization-challenges.v6",
      JSON.stringify([legacyRecord]),
    );
    expect(listChallenges()[0].title).toBe("رکورد قدیمی کاربر");
    window.localStorage.setItem("rahhal.organization-challenges.v7.mirror-fresh", "stale");
    window.localStorage.setItem("rahhal.organization-challenges.seeded.v7", "true");

    resetChallengeDemoData();

    expect(listChallenges()).toHaveLength(4);
    expect(listChallenges().some((record) => record.title === "رکورد قدیمی کاربر")).toBe(false);
    expect(window.localStorage.getItem("rahhal.organization-challenges.v7")).toBeNull();
    expect(
      window.localStorage.getItem("rahhal.organization-challenges.v7.mirror-fresh"),
    ).toBeNull();
    expect(window.localStorage.getItem("rahhal.organization-challenges.v6")).toBeNull();
    expect(window.localStorage.getItem("rahhal.organization-challenges.seeded.v7")).toBeNull();
  });

  it("فقط پیش‌نویس را حذف می‌کند و وضعیت ارسال را تغییر می‌دهد", () => {
    const draft = createBase();
    expect(deleteChallenge(draft.id)).toBe(true);
    expect(getChallenge(draft.id)).toBeUndefined();
    const next = completeRecord(createBase());
    const submitted = submitChallenge(next);
    expect(submitted.status).toBe("under_review");
    expect(submitted.submittedAt).toBeTruthy();
    expect(deleteChallenge(submitted.id)).toBe(false);
  });
});

describe("Routeهای کانونی و Redirectها", () => {
  it("شش Route اصلی برای هر شناسه داده‌محور resolve می‌شوند", () => {
    expect(getChallengeFlowRoute("/app/org/challenges")?.kind).toBe("list");
    expect(getChallengeFlowRoute("/app/org/challenges/new")?.kind).toBe("new");
    expect(getChallengeFlowRoute("/app/org/challenges/CH-DRAFT-001")?.kind).toBe("detail");
    expect(getChallengeFlowRoute("/app/org/challenges/CH-DRAFT-001/edit")?.kind).toBe("edit");
    expect(getChallengeFlowRoute("/app/org/challenges/CH-DRAFT-001/preview")?.kind).toBe("preview");
    expect(getChallengeFlowRoute("/app/org/challenges/CH-DRAFT-001/submitted")?.kind).toBe(
      "submitted",
    );
  });

  it("مسیرهای /org را Redirect و Studio و Overview را Canonical نگه می‌دارد", () => {
    expect(getChallengeFlowRoute("/org/challenges")?.kind).toBe("redirect");
    expect(getChallengeFlowRoute("/org/challenges/CH-DRAFT-001/edit")).toMatchObject({
      kind: "redirect",
      target: "/app/org/challenges/CH-DRAFT-001/edit",
    });
    expect(getChallengeFlowRoute("/app/org/challenges/CH-DRAFT-001/studio")?.kind).toBe("edit");
    expect(getChallengeFlowRoute("/app/org/challenges/CH-DRAFT-001/overview")?.kind).toBe("detail");
    expect(challengeFlowStaticPaths).toContain("/app/org/challenges/CH-DRAFT-001/edit");
  });
});

describe("Validation چهارمرحله‌ای و Progressive Disclosure", () => {
  it("گام اول فقط پس از ورود حداقل اطلاعات عبور می‌کند", () => {
    const valid = createBase();
    expect(validateStep(valid, 1)).toHaveLength(0);
    expect(validateStep({ ...valid, title: "" }, 1)).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: "title", step: 1 })]),
    );
  });

  it("معیار موفقیت کامل را در گام دوم الزام می‌کند", () => {
    const record = completeRecord(createBase());
    expect(validateStep(record, 2)).toHaveLength(0);
    expect(
      validateStep({ ...record, successCriteria: [] }, 2).some(
        (issue) => issue.field === "successCriteria",
      ),
    ).toBe(true);
  });

  it("دعوت‌شونده و مبلغ را فقط در انتخاب‌های وابسته الزام می‌کند", () => {
    const record = completeRecord(createBase());
    expect(validateStep(record, 3)).toHaveLength(0);
    const privateRecord = { ...record, sourcingModel: "private" as const, invitees: "" };
    expect(validateStep(privateRecord, 3).some((issue) => issue.field === "invitees")).toBe(true);
    const fixedBudget = { ...record, budgetStatus: "fixed" as const, budgetAmount: "" };
    expect(validateStep(fixedBudget, 3).some((issue) => issue.field === "budgetAmount")).toBe(true);
  });

  it("خلاصه عمومی را فقط برای سطح عمومی و کاربران ثبت‌شده الزام می‌کند", () => {
    const record = completeRecord(createBase());
    expect(validateStep(record, 4)).toHaveLength(0);
    expect(
      validateStep({ ...record, publicSummary: "" }, 4).some(
        (issue) => issue.field === "publicSummary",
      ),
    ).toBe(true);
    expect(
      validateStep({ ...record, visibility: "invite_only", publicSummary: "" }, 4).some(
        (issue) => issue.field === "publicSummary",
      ),
    ).toBe(false);
  });

  it("آمادگی ارسال را از همان قواعد چهار گام مشتق می‌کند", () => {
    const incomplete = createBase();
    expect(isRecordReady(incomplete)).toBe(false);
    expect(validateRecord(incomplete).length).toBeGreaterThan(5);
    expect(isRecordReady(completeRecord(incomplete))).toBe(true);
  });

  it("دامنه همکاری متناقض با مجموعه مجاز را رد و در ویرایش نرمال می‌کند", () => {
    const record = completeRecord(createBase());
    const contradictory: ChallengeRecord = { ...record, applicantScope: "both" };

    expect(validateStep(contradictory, 3)).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: "applicantScope", step: 3 })]),
    );
    expect(normalizedEditableRecord(contradictory)).toMatchObject({
      applicantScope: "team",
      status: "ready",
    });
  });
});
