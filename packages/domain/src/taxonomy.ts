export const applicantScopes = ["person", "team", "both"] as const;

export type ApplicantScope = (typeof applicantScopes)[number];

export const applicantTypes = [
  "individual",
  "expert-team",
  "company",
  "lab",
  "academic-group",
] as const;

export type ApplicantType = (typeof applicantTypes)[number];

export type TeamKind = Exclude<ApplicantType, "individual">;

export const teamKinds = applicantTypes.filter(
  (applicantType): applicantType is TeamKind => applicantType !== "individual",
);

export function isApplicantScope(value: unknown): value is ApplicantScope {
  return applicantScopes.includes(value as ApplicantScope);
}

export function isApplicantType(value: unknown): value is ApplicantType {
  return applicantTypes.includes(value as ApplicantType);
}

export function isTeamKind(value: unknown): value is TeamKind {
  return teamKinds.includes(value as TeamKind);
}

/**
 * `allowedApplicantTypes` is authoritative; ApplicantScope is its coarse,
 * derived projection. An empty authoring set has no scope yet.
 */
export function applicantScopeForTypes(
  allowedApplicantTypes: readonly ApplicantType[],
): ApplicantScope | null {
  const includesIndividual = allowedApplicantTypes.includes("individual");
  const includesTeam = allowedApplicantTypes.some((type) => type !== "individual");
  if (includesIndividual && includesTeam) return "both";
  if (includesIndividual) return "person";
  if (includesTeam) return "team";
  return null;
}

export function applicantScopeMatchesTypes(
  applicantScope: ApplicantScope | null,
  allowedApplicantTypes: readonly ApplicantType[],
): boolean {
  return applicantScope === applicantScopeForTypes(allowedApplicantTypes);
}
