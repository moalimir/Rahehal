/**
 * Build-time stand-in for the connected-runtime modules.
 *
 * The demo build is a static export with no API behind it, so `next.config.ts`
 * aliases the API client, connected challenge adapters, and platform approval
 * queue to this file. That keeps the connected UI, gateways, browser-session
 * client, and API route surface out of the demo bundle.
 *
 * Nothing here is reachable: every caller is behind `webRuntimeMode === "network"`,
 * which is `false` in exactly the builds that use this alias. The throws exist so
 * a future unguarded call fails loudly at the boundary instead of silently
 * pretending a demo build can talk to the API.
 */

function unreachable(name: string): never {
  throw new Error(
    `${name} is unavailable in the demo build; the connected runtime requires RAHHAL_WEB_RUNTIME=network`,
  );
}

/** Stands in for `@/lib/api/http`. */
export function requestApi(): never {
  return unreachable("requestApi");
}

/** Stands in for `@/lib/api/http`. */
export function idempotencyKey(): never {
  return unreachable("idempotencyKey");
}

/** Stands in for `@/lib/auth/network-session`. */
export function networkInternalSession(): null {
  return null;
}

/** Stands in for `@/lib/auth/network-session`. */
export function workspacesForPersona(): readonly never[] {
  return [];
}

/** Stands in for `@/lib/auth/network-organization-shell`. */
export function networkOrganizationRoleLabel(): string {
  return "عضو سازمان";
}

/** Stands in for `@/lib/auth/network-organization-shell`. */
export function networkOrganizationNavigation<T>(items: readonly T[]): T[] {
  return [...items];
}

/** Stands in for `@/lib/challenges/adapters/network`. */
export function createNetworkChallengeGateway(): never {
  return unreachable("createNetworkChallengeGateway");
}

/** Stands in for `@/lib/challenges/adapters/network-governance`. */
export function createNetworkChallengeGovernanceGateway(): never {
  return unreachable("createNetworkChallengeGovernanceGateway");
}

/** Stands in for `@/lib/challenges/adapters/network-public-challenges`. */
export function readPublicChallenge(): never {
  return unreachable("readPublicChallenge");
}

/** Stands in for `@/lib/challenges/adapters/network-public-challenges`. */
export function listPublicChallenges(): never {
  return unreachable("listPublicChallenges");
}

/** Stands in for `@/components/public-challenge-catalogue`. */
export function PublicChallengeCatalogue(): never {
  return unreachable("PublicChallengeCatalogue");
}

/** Stands in for `@/components/public-challenge-record`. */
export function PublicChallengeRecordRoute(): string {
  return "نمایش فراخوان سرور فقط در اجرای متصل در دسترس است.";
}

/** Stands in for `@/components/challenge-flow/live-call-controls`. */
export function LiveCallControls(): never {
  return unreachable("LiveCallControls");
}

/** Stands in for `@/components/platform-approval-queue`. */
export function PlatformApprovalQueue(): never {
  return unreachable("PlatformApprovalQueue");
}

/** Stands in for `@/components/organization-preview-notice`. */
export function PreviewDataNotice(): never {
  return unreachable("PreviewDataNotice");
}

/** Stands in for `@/components/challenge-flow/connected-record-links`. */
export function ConnectedRecordLinks(): never {
  return unreachable("ConnectedRecordLinks");
}

/** Stands in for `@/components/internal/network-internal-boundary`. */
export function NetworkInternalBoundary(): never {
  return unreachable("NetworkInternalBoundary");
}

/** Stands in for `@/components/site-header-session`. */
export function SessionHeaderActions(): never {
  return unreachable("SessionHeaderActions");
}

/** Stands in for `@/components/portal/network-organization-login`. */
export function NetworkOrganizationLogin(): never {
  return unreachable("NetworkOrganizationLogin");
}

/** Stands in for `@/components/portal/network-organization-login`. */
export function NetworkOrganizationRegistration(): never {
  return unreachable("NetworkOrganizationRegistration");
}
