export const applicantScopes = ["person", "team", "both"] as const;

export type ApplicantScope = (typeof applicantScopes)[number];

export function isApplicantScope(value: unknown): value is ApplicantScope {
  return applicantScopes.includes(value as ApplicantScope);
}

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

export function isTeamKind(value: unknown): value is TeamKind {
  return teamKinds.includes(value as TeamKind);
}
