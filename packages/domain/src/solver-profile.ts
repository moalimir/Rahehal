import type { ApplicantType } from "./taxonomy.js";

export const verificationStates = [
  "not_started",
  "draft",
  "submitted",
  "under_review",
  "verified",
  "needs_revision",
  "rejected",
  "expired",
] as const;
export type VerificationState = (typeof verificationStates)[number];

export const eligibilityGateKinds = ["nda", "document_acknowledgement"] as const;
export type EligibilityGateKind = (typeof eligibilityGateKinds)[number];

export const solverOutboxEventTypes = [
  "solver.profile.updated",
  "verification.draft.created",
  "eligibility.gate.accepted",
] as const;

export type SolverProfileFacts = {
  readonly applicantType: ApplicantType;
  readonly headline: string;
  readonly overview: string;
  readonly expertise: readonly string[];
  readonly geography: readonly string[];
};

export type SolverProfileReadinessIssue = {
  readonly path: string;
  readonly code: "required" | "min_length";
  readonly message: string;
};

export type SolverProfileReadiness = {
  readonly ready: boolean;
  readonly issues: readonly SolverProfileReadinessIssue[];
};

/** Readiness is server-derived and is not an unversioned eligibility gate. */
export function evaluateSolverProfileReadiness(
  facts: Pick<SolverProfileFacts, "headline" | "overview" | "expertise" | "geography">,
): SolverProfileReadiness {
  const issues: SolverProfileReadinessIssue[] = [];
  if (facts.headline.trim().length < 5) {
    issues.push({
      path: "/headline",
      code: "min_length",
      message: "عنوان حرفه‌ای را کامل‌تر وارد کنید.",
    });
  }
  if (facts.overview.trim().length < 20) {
    issues.push({
      path: "/overview",
      code: "min_length",
      message: "معرفی حرفه‌ای را کامل‌تر بنویسید.",
    });
  }
  if (facts.expertise.length === 0) {
    issues.push({ path: "/expertise", code: "required", message: "حداقل یک تخصص ثبت کنید." });
  }
  if (facts.geography.length === 0) {
    issues.push({ path: "/geography", code: "required", message: "محدوده جغرافیایی را ثبت کنید." });
  }
  return { ready: issues.length === 0, issues };
}

export function isVerificationState(value: unknown): value is VerificationState {
  return verificationStates.includes(value as VerificationState);
}
