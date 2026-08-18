export function standalonePathFromHash(hash: string): string {
  if (!hash.startsWith("#/")) return "/";
  const raw = hash.slice(1);
  const hashIndex = raw.indexOf("#");
  const beforeAnchor = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw;
  const queryIndex = beforeAnchor.indexOf("?");
  const pathname = queryIndex >= 0 ? beforeAnchor.slice(0, queryIndex) : beforeAnchor;
  return pathname !== "/" ? pathname.replace(/\/+$/, "") : "/";
}

export function standaloneQueryFromHash(hash: string): string {
  if (!hash.startsWith("#/")) return "";
  const raw = hash.slice(1);
  const queryIndex = raw.indexOf("?");
  if (queryIndex < 0) return "";
  const anchorIndex = raw.indexOf("#", queryIndex);
  return raw.slice(queryIndex, anchorIndex >= 0 ? anchorIndex : undefined);
}

const fileLike = /\.(?:pdf|docx?|xlsx?|csv|zip|png|jpe?g|webp|svg)(?:[?#]|$)/i;

export function shouldHandleStandaloneAnchor(
  event: Pick<
    MouseEvent,
    "button" | "defaultPrevented" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey"
  >,
  anchor: Pick<HTMLAnchorElement, "target" | "download"> & {
    getAttribute(name: string): string | null;
  },
): boolean {
  const href = anchor.getAttribute("href") ?? "";
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    Boolean(anchor.download) ||
    (anchor.target && anchor.target !== "_self") ||
    !href.startsWith("/") ||
    href.startsWith("//") ||
    fileLike.test(href)
  ) {
    return false;
  }
  return true;
}

export function standaloneDestination(href: string): string {
  return href === "/" ? "" : href;
}
