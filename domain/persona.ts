/**
 * Presentation-only application areas used by routing and the demo session.
 * These values are not authorization roles; production policy uses the
 * namespaced roles exported by `@rahhal/domain`.
 */
export const appPersonas = ["org", "solver", "reviewer", "ops"] as const;

export type AppPersona = (typeof appPersonas)[number];

export function isAppPersona(value: unknown): value is AppPersona {
  return appPersonas.includes(value as AppPersona);
}
