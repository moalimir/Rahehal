export const applicantScopes = ["person", "team", "both"] as const;

export type ApplicantScope = (typeof applicantScopes)[number];

export function isApplicantScope(value: unknown): value is ApplicantScope {
  return applicantScopes.includes(value as ApplicantScope);
}
