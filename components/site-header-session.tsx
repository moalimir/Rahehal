"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { useWebRuntime } from "@/components/runtime-provider";
import { networkInternalSession } from "@/lib/auth/network-session";

/**
 * Where each persona's workspace starts. A signed-in visitor who lands back on
 * a public page needs the way *in*, not another invitation to sign up.
 */
const workspaceHome: Record<string, string> = {
  org: "/app/org/challenges",
  solver: "/app/solver/dashboard",
  reviewer: "/app/reviewer/assignments",
  ops: "/app/ops/publication",
};

const workspaceEntryLabel: Record<string, string> = {
  org: "پنل سازمان",
  solver: "پنل حل‌کننده",
  reviewer: "پنل داوری",
  ops: "پنل عملیات",
};

/**
 * The public header's sign-in area, once a real session exists.
 *
 * The marketing header offered "sign in" and "register" on every page
 * regardless of session, so an organization that had just signed in was still
 * being asked to sign in — twice, once for each audience. Those calls to
 * action are for visitors; this replaces them for people who are already
 * through the door, and falls back to them when nobody is.
 *
 * Connected-only, and aliased out of the demo bundle: the static export has no
 * session to ask about, so its header keeps the marketing calls to action.
 */
export function SessionHeaderActions({ fallback }: { fallback: ReactNode }) {
  const runtime = useWebRuntime();
  const session = networkInternalSession(runtime.me);

  // Anonymous, still loading, or signed in without an active workspace: the
  // marketing header is still the right answer. A half-resolved session must
  // not flash a workspace link that then disappears.
  if (runtime.sessionStatus !== "authenticated" || !session) return <>{fallback}</>;

  return (
    <nav className="header-session" aria-label="حساب کاربری">
      <Link
        className="header-session__enter is-primary"
        href={workspaceHome[session.persona] ?? "/app"}
      >
        {workspaceEntryLabel[session.persona] ?? "پنل کاربری"}
      </Link>
    </nav>
  );
}
