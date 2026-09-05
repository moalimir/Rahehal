import { internalRoutes, type InternalRoute } from "@/data/internal-routes";
import { legacyRouteEntries } from "@/data/legacy-redirects";
import { publicProductRoutes } from "@/data/public-product-routes";
import { routeDefinitions } from "@/data/routes";
import { WORKSPACE_RESOLVER_PATH } from "@/lib/routing/workspace-home";

/**
 * C9 route truthfulness.
 *
 * The audit's rule is that every route reachable in connected navigation is
 * either authoritative for the active workspace or explicitly marked. A page
 * that renders fixture counts under a live session is the specific failure
 * this classification exists to make impossible to ship by accident.
 *
 * - `live`      the surface reads and writes server authority for the active workspace
 * - `preview`   it renders sample material and says so; no authoritative-looking mutation
 * - `unavailable` it is a later phase and is not reachable as if it worked
 * - `redirect`  it forwards to the canonical path
 */
export type RouteClassification = "live" | "preview" | "unavailable" | "redirect";

export type ClassifiedRoute = {
  readonly path: string;
  readonly classification: RouteClassification;
  /** The milestone that made it live, or the phase that still owns it. */
  readonly owner: string;
};

/**
 * Surfaces the connected MVP journey actually walks through. Everything here
 * must be `live` before C10 can certify the journey; the classification test
 * fails if one of them is downgraded.
 */
const liveConnectedRoutes: Readonly<Record<string, string>> = {
  [WORKSPACE_RESOLVER_PATH]: "C9",
  "/app/org/challenges": "B1/B2",
  "/app/org/challenges/new": "B1",
  "/app/org/proposals": "C4",
  "/app/org/notifications": "C8",
  "/app/solver/dashboard": "C8/C9",
  "/app/solver/opportunities": "C1/C6",
  "/app/solver/proposals": "C3",
  "/app/solver/saved": "C6",
  "/app/solver/teams": "C2",
  "/app/solver/profile": "C1",
  "/app/solver/notifications": "C8",
};

/**
 * Families whose server authority is a later phase. They stay reachable only
 * as an explicit boundary, never as a working surface.
 */
const laterPhaseFamilies: readonly string[] = [
  "/app/reviewer",
  "/app/ops",
  "/app/org/contracts",
  "/app/org/pilots",
  "/app/org/reports",
  "/app/org/decisions",
  "/app/org/cases",
  "/app/solver/contracts",
  "/app/solver/payments",
];

function isLaterPhase(path: string): boolean {
  return laterPhaseFamilies.some((family) => path === family || path.startsWith(`${family}/`));
}

export function classifyRoute(path: string): ClassifiedRoute {
  if (legacyRouteEntries.some((entry) => entry.source === path)) {
    return { path, classification: "redirect", owner: "legacy" };
  }
  const live = liveConnectedRoutes[path];
  if (live) return { path, classification: "live", owner: live };
  if (isLaterPhase(path)) return { path, classification: "unavailable", owner: "Phase 4+" };
  return { path, classification: "preview", owner: "prototype" };
}

/** Every registered route with its classification, for the audit and its test. */
export function classifyRegisteredRoutes(): readonly ClassifiedRoute[] {
  const paths = new Set<string>([
    WORKSPACE_RESOLVER_PATH,
    ...routeDefinitions.map((route) => route.path),
    ...publicProductRoutes.map((route) => route.path),
    ...internalRoutes.map((route: InternalRoute) => route.path),
    ...legacyRouteEntries.map((entry) => entry.source),
  ]);
  return [...paths].sort().map(classifyRoute);
}

export function classificationTotals(): Readonly<Record<RouteClassification, number>> {
  const totals: Record<RouteClassification, number> = {
    live: 0,
    preview: 0,
    unavailable: 0,
    redirect: 0,
  };
  for (const route of classifyRegisteredRoutes()) totals[route.classification] += 1;
  return totals;
}

export const connectedMvpRoutes = Object.keys(liveConnectedRoutes);
