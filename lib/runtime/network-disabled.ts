/**
 * Build-time stand-in for the connected-runtime modules.
 *
 * The demo build is a static export with no API behind it, so `next.config.ts`
 * aliases `@/lib/api/http` and `@/lib/challenges/adapters/network` to this file.
 * That keeps the network gateway, the browser-session client, and the API route
 * surface out of the demo bundle entirely rather than shipping them as dead
 * weight (they are ~3 KB of the static JavaScript budget, and the demo artifact
 * should not advertise the authoritative API surface at all).
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

/** Stands in for `@/lib/challenges/adapters/network`. */
export function createNetworkChallengeGateway(): never {
  return unreachable("createNetworkChallengeGateway");
}
