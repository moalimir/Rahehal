export const contactVerificationChannels = ["email", "mobile"] as const;
export type ContactVerificationChannel = (typeof contactVerificationChannels)[number];

export const contactVerificationStates = [
  "pending",
  "verified",
  "expired",
  "locked",
  "consumed",
] as const;
export type ContactVerificationState = (typeof contactVerificationStates)[number];

export const solverStartIntents = ["individual", "team"] as const;
export type SolverStartIntent = (typeof solverStartIntents)[number];

export const solverActivationOutboxEventTypes = [
  "solver.activated",
  "contact.session.exchanged",
] as const;
export type SolverActivationOutboxEventType = (typeof solverActivationOutboxEventTypes)[number];

export function isContactVerificationChannel(value: unknown): value is ContactVerificationChannel {
  return contactVerificationChannels.includes(value as ContactVerificationChannel);
}

export function isSolverStartIntent(value: unknown): value is SolverStartIntent {
  return solverStartIntents.includes(value as SolverStartIntent);
}
