import { isNetworkWebRuntime } from "@/lib/runtime/mode";

/**
 * Connected builds address a challenge record through one pre-generated path
 * plus an `id` query parameter, instead of putting the server-generated id in
 * the path itself.
 *
 * Next only accepts a literal for the `dynamicParams` route segment config, so
 * the catch-all route cannot be `false` for the static demo export and `true`
 * for the connected build at the same time. Keeping ids out of the path lets
 * both builds share one route table, and the resulting URL is still a real,
 * shareable deep link. The demo build keeps its path-based ids, which are a
 * fixed set and therefore pre-generatable.
 */
export const CONNECTED_RECORD_PATH = "/app/org/challenges/record";

const recordPathPattern =
  /^\/app\/org\/challenges\/(chl_[A-Za-z0-9][A-Za-z0-9_-]{2,63})(?:\/(overview|edit|studio|preview|submitted))?$/;

/**
 * Rewrites a canonical `/app/org/challenges/<id>/<view>` link to the connected
 * record path. Callers keep building canonical paths; only the connected build
 * rewrites them, and anything that is not a server id passes through untouched.
 */
export function connectedChallengeHref(href: string): string {
  const [rawPath, rawQuery = ""] = href.split("?");
  const path = rawPath.length > 1 ? rawPath.replace(/\/$/, "") : rawPath;
  const match = path.match(recordPathPattern);
  if (!match) return href;

  const [, id, view] = match;
  const query = new URLSearchParams(rawQuery);
  query.delete("id");
  const trailing = query.toString();
  return `${CONNECTED_RECORD_PATH}${view ? `/${view}` : ""}/?id=${encodeURIComponent(id)}${
    trailing ? `&${trailing}` : ""
  }`;
}

export function navigateChallenge(path: string, replace = false) {
  if (typeof window === "undefined") return;
  const target = isNetworkWebRuntime ? connectedChallengeHref(path) : path;
  if (document.documentElement.dataset.challengeStandalone === "true") {
    const hash = `#${target.startsWith("/") ? target : `/${target}`}`;
    if (replace) window.location.replace(hash);
    else window.location.hash = hash.slice(1);
    return;
  }
  if (replace) window.location.replace(target);
  else window.location.assign(target);
}

export function readStandalonePath() {
  if (typeof window === "undefined") return null;
  if (document.documentElement.dataset.challengeStandalone !== "true") return null;
  const raw = window.location.hash.startsWith("#/")
    ? window.location.hash.slice(1)
    : "/app/org/challenges/";
  const [pathname, query = ""] = raw.split("?");
  return { pathname: pathname.replace(/\/$/, "") || "/", query: query ? `?${query}` : "" };
}
