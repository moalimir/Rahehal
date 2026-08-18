"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { useSolverContext, useSolverSpace, type SolverSection } from "@/components/solver-shell";
import type { SolverState } from "@/domain/solver";
import { buildSolverHref } from "@/lib/solver/context";
import { readSolverState, subscribeSolverState } from "@/lib/solver/repository";

export function useCanonicalSolverState() {
  const [state, setState] = useState<SolverState>(() => readSolverState());
  useEffect(() => subscribeSolverState(() => setState(readSolverState())), []);
  return state;
}

export function readSolverListParams() {
  if (typeof window === "undefined") return new URLSearchParams();
  const source =
    document.documentElement.dataset.challengeStandalone === "true"
      ? (window.location.hash.split("?")[1] ?? "")
      : window.location.search.slice(1);
  return new URLSearchParams(source);
}

export type SolverProfileSection =
  | Extract<
      SolverSection,
      "received" | "team-building" | "proposals" | "saved" | "invitations" | "profile" | "settings"
    >
  | "teams"
  | "offer-response";

export function useCurrentSpace() {
  return useSolverSpace();
}

export function PageHeading({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  const context = useSolverContext();
  return (
    <header className="rh-profile-heading">
      <div>
        <nav aria-label="مسیر صفحه">
          <Link href={buildSolverHref("/app/solver/dashboard", context)}>
            <Icon name="grid" /> فضای کاری
          </Link>
          <span>/</span>
          <span>{title}</span>
        </nav>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </header>
  );
}

export function Toast({ message }: { message: string }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!message) {
      setVisible(false);
      return;
    }
    setVisible(true);
    const timeout = window.setTimeout(() => setVisible(false), 6500);
    return () => window.clearTimeout(timeout);
  }, [message]);
  if (!message || !visible) return null;
  return (
    <div className="rh-profile-toast" role="status">
      <Icon name="check" />
      <span>{message}</span>
      <button type="button" onClick={() => setVisible(false)} aria-label="بستن پیام">
        <Icon name="close" />
      </button>
    </div>
  );
}
