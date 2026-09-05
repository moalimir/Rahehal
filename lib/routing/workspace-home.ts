import type { AppPersona } from "@/domain/persona";

/** The single authenticated entry point that resolves the active workspace. */
export const WORKSPACE_RESOLVER_PATH = "/app";

/**
 * Where each persona's workspace begins.
 *
 * `/app` resolves to one of these, and public chrome links here rather than
 * re-offering sign-in to someone who is already signed in. Keeping the table
 * in one place means the header, the drawer, the footer, and the resolver
 * cannot drift into sending the same persona to different homes.
 */
const workspaceHome: Readonly<Record<string, string>> = {
  org: "/app/org/challenges",
  solver: "/app/solver/dashboard",
  reviewer: "/app/reviewer/assignments",
  ops: "/app/ops/publication",
};

export function workspaceHomePath(persona: AppPersona | string): string {
  return workspaceHome[persona] ?? "/app";
}

export const workspaceEntryLabel: Readonly<Record<string, string>> = {
  org: "پنل سازمان",
  solver: "پنل حل‌کننده",
  reviewer: "پنل داوری",
  ops: "پنل عملیات",
};

export function workspaceEntryLabelFor(persona: AppPersona | string): string {
  return workspaceEntryLabel[persona] ?? "پنل کاربری";
}
