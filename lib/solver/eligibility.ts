import type { ActiveWorkspace, SolverState, VerificationState } from "@/domain/solver";
import type { ApplicantType } from "@/domain/taxonomy";

export type EligibilityRule = {
  challengeId: string;
  allowedApplicantTypes: ApplicantType[];
  verificationRequired: boolean;
  minimumReadiness: number;
  requiredExpertise: string[];
  geography?: string[];
  ndaRequired: boolean;
  documentGate: boolean;
  deadline: string;
  state: "open" | "closed" | "paused";
};

export type EligibilityResult = {
  status: "eligible" | "ineligible" | "needs-action" | "needs-review";
  reasons: string[];
  actions: Array<{ label: string; href: string }>;
};

/**
 * A demo deadline that never falls into the past.
 *
 * These fixtures carried absolute dates, so the demo aged into a state nobody
 * authored: every call quietly closed as its date went by, and the two tests
 * that lean on `CH-1405-022` began failing on 2026-09-09 for no reason anyone
 * had changed. The authoritative path reads `eligibility_rule` from PostgreSQL
 * and is unaffected; this is the static export's own data, so it is expressed
 * as a distance from whenever the demo is being read.
 */
function demoDeadline(days: number): string {
  const at = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  at.setUTCHours(20, 30, 0, 0);
  return at.toISOString();
}

export const challengeEligibilityRules: Record<string, EligibilityRule> = {
  "CH-1405-021": {
    challengeId: "CH-1405-021",
    allowedApplicantTypes: ["individual", "expert-team", "lab", "company"],
    verificationRequired: true,
    minimumReadiness: 70,
    requiredExpertise: ["طراحی مکانیک", "تحلیل داده", "شیمی آب"],
    geography: ["ایران"],
    ndaRequired: true,
    documentGate: true,
    deadline: demoDeadline(12),
    state: "open",
  },
  "CH-1405-022": {
    challengeId: "CH-1405-022",
    allowedApplicantTypes: ["individual", "expert-team", "company"],
    verificationRequired: false,
    minimumReadiness: 60,
    requiredExpertise: ["پایش صنعتی", "تحلیل داده"],
    geography: ["ایران"],
    ndaRequired: false,
    documentGate: false,
    deadline: demoDeadline(5),
    state: "open",
  },
  "CH-1405-024": {
    challengeId: "CH-1405-024",
    allowedApplicantTypes: ["individual", "expert-team", "company"],
    verificationRequired: false,
    minimumReadiness: 60,
    requiredExpertise: ["اتوماسیون صنعتی", "پایش صنعتی"],
    ndaRequired: false,
    documentGate: false,
    deadline: demoDeadline(17),
    state: "open",
  },
  "CH-1405-028": {
    challengeId: "CH-1405-028",
    allowedApplicantTypes: ["lab", "academic-group", "company"],
    verificationRequired: true,
    minimumReadiness: 75,
    requiredExpertise: ["شیمی آب", "سنجش محیطی"],
    ndaRequired: true,
    documentGate: true,
    deadline: demoDeadline(28),
    state: "open",
  },
};

export function profileReadiness(state: SolverState, context: ActiveWorkspace) {
  if (context.type === "individual") {
    const profile = state.personalProfiles.find(
      (candidate) => candidate.workspaceId === context.workspaceId,
    );
    if (!profile) return 0;
    const checks = [
      profile.headline,
      profile.bio,
      profile.skills.length,
      profile.experiences.length,
      profile.education.length,
      profile.projects.length,
      profile.availability,
      profile.resumeFileName,
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }
  const profile = state.teamProfiles.find((candidate) => candidate.teamId === context.teamId);
  if (!profile) return 0;
  const checks = [
    profile.introduction,
    profile.valueProposition,
    profile.expertise.length,
    profile.industries.length,
    profile.technologies.length,
    profile.capacity,
    profile.caseStudies.length,
    profile.publicContact,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

function applicantType(state: SolverState, context: ActiveWorkspace): ApplicantType | null {
  if (context.type === "individual") return "individual";
  return state.teams.find((team) => team.id === context.teamId)?.teamKind ?? null;
}

function verificationState(state: SolverState, context: ActiveWorkspace): VerificationState {
  return (
    state.verifications.find((verification) => verification.workspaceId === context.workspaceId)
      ?.state ?? "not_started"
  );
}

export function evaluateEligibility(
  rule: EligibilityRule | undefined,
  state: SolverState,
  context: ActiveWorkspace,
  at = Date.now(),
): EligibilityResult {
  if (!rule)
    return {
      status: "needs-review",
      reasons: ["قواعد ساخت‌یافته این فرصت هنوز کامل نشده است."],
      actions: [],
    };
  if (rule.state !== "open" || new Date(rule.deadline).getTime() <= at)
    return { status: "ineligible", reasons: ["مهلت دریافت پیشنهاد پایان یافته است."], actions: [] };
  const type = applicantType(state, context);
  if (!type)
    return {
      status: "ineligible",
      reasons: ["نوع تیم فضای کاری فعال قابل تشخیص نیست."],
      actions: [],
    };
  if (!rule.allowedApplicantTypes.includes(type))
    return {
      status: "ineligible",
      reasons: ["نوع فضای کاری فعال در فهرست متقاضیان مجاز نیست."],
      actions: [],
    };
  const reasons: string[] = [];
  const actions: EligibilityResult["actions"] = [];
  const readiness = profileReadiness(state, context);
  if (readiness < rule.minimumReadiness) {
    reasons.push(
      `آمادگی پروفایل ${readiness.toLocaleString("fa-IR")}٪ است و حداقل ${rule.minimumReadiness.toLocaleString("fa-IR")}٪ لازم است.`,
    );
    actions.push({ label: "تکمیل پروفایل", href: "/app/solver/profile" });
  }
  const verification = verificationState(state, context);
  if (rule.verificationRequired && verification !== "verified") {
    reasons.push("احراز این فضای کاری هنوز تأیید نشده است.");
    actions.push({ label: "پیگیری احراز", href: "/app/solver/verification" });
  }
  const expertise =
    context.type === "individual"
      ? (state.personalProfiles.find((profile) => profile.workspaceId === context.workspaceId)
          ?.skills ?? [])
      : (state.teamProfiles.find((profile) => profile.teamId === context.teamId)?.expertise ?? []);
  if (!rule.requiredExpertise.some((item) => expertise.includes(item)))
    reasons.push("تخصص موردنیاز در پروفایل این فضا ثبت نشده و نیازمند بررسی است.");
  if (reasons.length)
    return {
      status: actions.length ? "needs-action" : "needs-review",
      reasons,
      actions,
    };
  return {
    status: "eligible",
    reasons: ["نوع متقاضی، آمادگی پروفایل، تخصص و وضعیت احراز با قواعد فرصت سازگار است."],
    actions: [],
  };
}
