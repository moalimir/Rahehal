export type ReturnRole = "org" | "solver" | "reviewer" | "ops" | "any";

const prefixes: Record<Exclude<ReturnRole, "any">, string> = {
  org: "/app/org/",
  solver: "/app/solver/",
  reviewer: "/app/reviewer/",
  ops: "/app/ops/",
};

/** Accepts only a same-application canonical deep link and preserves its query context. */
export function safeReturnTo(value: string | null | undefined, role: ReturnRole): string {
  if (
    !value ||
    value.length > 2048 ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  )
    return "";
  try {
    const url = new URL(value, "https://rahhal.invalid");
    if (url.origin !== "https://rahhal.invalid" || !url.pathname.startsWith("/app/")) return "";
    if (role !== "any" && !url.pathname.startsWith(prefixes[role])) return "";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "";
  }
}
