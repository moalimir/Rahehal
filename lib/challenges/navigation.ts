export function navigateChallenge(path: string, replace = false) {
  if (typeof window === "undefined") return;
  if (document.documentElement.dataset.challengeStandalone === "true") {
    const hash = `#${path.startsWith("/") ? path : `/${path}`}`;
    if (replace) window.location.replace(hash);
    else window.location.hash = hash.slice(1);
    return;
  }
  if (replace) window.location.replace(path);
  else window.location.assign(path);
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
