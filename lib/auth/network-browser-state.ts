/**
 * Browser-owned authority from the static prototype must never influence the
 * connected application. Remove only the known demo/session namespaces; UI
 * preferences (for example list/grid choice) deliberately remain intact.
 */
const obsoleteLocalPrefixes = [
  "rahhal.session.",
  "rahhal.solver.active-workspace.",
  "rahhal.solver.recovery.",
  "rahhal.solver.v",
  "rahhal.organization-challenges.",
  "rahhal.demo-",
  "rahhal:proposal:",
  "rahhal:solver-",
  "rahhal:saved:",
] as const;

const obsoleteSessionKeys = [
  "rahhal.solver-registration",
  "rahhal.organization-registration.representative",
] as const;

function removeMatching(storage: Storage, matches: (key: string) => boolean) {
  const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter(
    (key): key is string => Boolean(key),
  );
  for (const key of keys) if (matches(key)) storage.removeItem(key);
}

export function clearObsoleteConnectedBrowserState() {
  try {
    removeMatching(window.localStorage, (key) =>
      obsoleteLocalPrefixes.some((prefix) => key.startsWith(prefix)),
    );
  } catch {
    // Storage may be disabled. Connected authority still comes from the server.
  }
  try {
    for (const key of obsoleteSessionKeys) window.sessionStorage.removeItem(key);
  } catch {
    // Same as above: failure to clean a cache must not block the live session.
  }
}
