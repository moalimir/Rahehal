"use client";

import type { ReactNode } from "react";

import { isNetworkWebRuntime } from "@/lib/runtime/mode";
import { SessionHeaderActions } from "@/components/site-header-session";

/**
 * Chooses between the marketing calls to action and a signed-in visitor's way
 * back into their workspace.
 *
 * The check lives here rather than inside `SessionHeaderActions` because that
 * component is aliased away in the demo build — it must never be *called*
 * there, only never reached. In the static export there is no session to ask
 * about, so the fallback is always the right answer.
 */
export function SessionAware({ fallback }: { fallback: ReactNode }) {
  if (!isNetworkWebRuntime) return <>{fallback}</>;
  return <SessionHeaderActions fallback={fallback} />;
}
