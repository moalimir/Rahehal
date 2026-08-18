"use client";

import { useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { RoleAppShell, type AppNavigationItem } from "@/components/app-shell";
import type { ActiveWorkspace } from "@/domain/solver";
import {
  DEFAULT_SOLVER_CONTEXT,
  buildSolverHref,
  contextFromLocation,
  type SolverContextResolution,
} from "@/lib/solver/context";
import { TEAM_ROLE_LABELS } from "@/lib/solver/permissions";
import {
  activeWorkspaces,
  readSolverState,
  subscribeSolverState,
  unreadNotificationCount,
} from "@/lib/solver/repository";
import { readLastActiveWorkspace, writeLastActiveWorkspace } from "@/lib/solver/session";

export type SolverSpace = "individual" | "team";
export type SolverSection =
  | "dashboard"
  | "challenges"
  | "received"
  | "team-building"
  | "proposals"
  | "saved"
  | "invitations"
  | "profile"
  | "settings"
  | "notifications"
  | "guide";

const individualNavigation: AppNavigationItem[] = [
  {
    key: "dashboard",
    label: "داشبورد",
    href: "/app/solver/dashboard?space=individual",
    matches: ["/app/solver/dashboard"],
    icon: "grid",
  },
  {
    key: "challenges",
    label: "چالش‌ها و فرصت‌ها",
    href: "/app/solver/opportunities?space=individual",
    matches: ["/app/solver/opportunities"],
    icon: "brief",
  },
  {
    key: "received",
    label: "پیشنهادهای دریافتی",
    href: "/app/solver/received-proposals?space=individual",
    matches: ["/app/solver/received-proposals"],
    icon: "notification",
  },
  {
    key: "team-building",
    label: "تیم‌سازی",
    href: "/app/solver/team-building?space=individual",
    matches: ["/app/solver/team-building"],
    icon: "match",
  },
  {
    key: "proposals",
    label: "درخواست‌ها و راه‌حل‌های من",
    href: "/app/solver/proposals?space=individual",
    matches: [
      "/app/solver/proposals",
      "/app/solver/pilots",
      "/app/solver/payments",
      "/app/solver/messages",
      "/app/solver/cases",
    ],
    icon: "decision",
  },
  {
    key: "saved",
    label: "فرصت‌های ذخیره‌شده",
    href: "/app/solver/saved?space=individual",
    matches: ["/app/solver/saved"],
    icon: "history",
  },
  {
    key: "invitations",
    label: "دعوت‌نامه‌های تیمی",
    href: "/app/solver/invitations?space=individual",
    matches: ["/app/solver/invitations", "/app/solver/teams"],
    icon: "people",
  },
  {
    key: "profile",
    label: "پروفایل و رزومه",
    href: "/app/solver/profile?space=individual",
    matches: ["/app/solver/profile"],
    icon: "shield",
  },
  {
    key: "notifications",
    label: "پیام‌ها و اعلان‌ها",
    href: "/app/solver/notifications?space=individual",
    matches: ["/app/solver/notifications", "/app/solver/messages"],
    icon: "notification",
  },
  {
    key: "settings",
    label: "تنظیمات",
    href: "/app/solver/settings?space=individual",
    matches: ["/app/solver/settings", "/app/solver/verification"],
    icon: "notification",
  },
  {
    key: "guide",
    label: "مرکز راهنما",
    href: "/guides/intellectual-property?space=individual",
    matches: ["/guides/intellectual-property"],
    icon: "shield",
  },
];

const teamNavigation: AppNavigationItem[] = [
  {
    key: "dashboard",
    label: "داشبورد تیم",
    href: "/app/solver/dashboard?space=team",
    matches: ["/app/solver/dashboard"],
    icon: "grid",
  },
  {
    key: "challenges",
    label: "چالش‌ها و فرصت‌ها",
    href: "/app/solver/opportunities?space=team",
    matches: ["/app/solver/opportunities"],
    icon: "brief",
  },
  {
    key: "received",
    label: "پیشنهادهای دریافتی",
    href: "/app/solver/received-proposals?space=team",
    matches: ["/app/solver/received-proposals"],
    icon: "notification",
  },
  {
    key: "team-building",
    label: "تیم‌سازی / تکمیل اعضا",
    href: "/app/solver/team-building?space=team",
    matches: ["/app/solver/team-building"],
    icon: "match",
  },
  {
    key: "proposals",
    label: "درخواست‌ها و راه‌حل‌های تیم",
    href: "/app/solver/proposals?space=team",
    matches: [
      "/app/solver/proposals",
      "/app/solver/pilots",
      "/app/solver/payments",
      "/app/solver/messages",
      "/app/solver/cases",
    ],
    icon: "decision",
  },
  {
    key: "saved",
    label: "فرصت‌های ذخیره‌شده",
    href: "/app/solver/saved?space=team",
    matches: ["/app/solver/saved"],
    icon: "history",
  },
  {
    key: "invitations",
    label: "درخواست‌های عضویت",
    href: "/app/solver/invitations?space=team",
    matches: ["/app/solver/invitations", "/app/solver/teams"],
    icon: "people",
  },
  {
    key: "profile",
    label: "پروفایل تیم",
    href: "/app/solver/profile?space=team",
    matches: ["/app/solver/profile"],
    icon: "match",
  },
  {
    key: "notifications",
    label: "پیام‌ها و اعلان‌ها",
    href: "/app/solver/notifications?space=team",
    matches: ["/app/solver/notifications", "/app/solver/messages"],
    icon: "notification",
  },
  {
    key: "settings",
    label: "تنظیمات تیم",
    href: "/app/solver/settings?space=team",
    matches: ["/app/solver/settings", "/app/solver/verification"],
    icon: "shield",
  },
  {
    key: "guide",
    label: "مرکز راهنما",
    href: "/guides/intellectual-property?space=team",
    matches: ["/guides/intellectual-property"],
    icon: "shield",
  },
];

export function readSolverSpace(): SolverSpace {
  return readSolverContext().type;
}

export function readSolverContext(): ActiveWorkspace {
  if (typeof window === "undefined") return DEFAULT_SOLVER_CONTEXT;
  const raw =
    document.documentElement.dataset.challengeStandalone === "true"
      ? window.location.hash
      : window.location.search;
  const hasExplicitSpace = /(?:\?|&)space=/.test(raw);
  if (!hasExplicitSpace) return readLastActiveWorkspace();
  const state = readSolverState();
  const resolution = contextFromLocation(state);
  return resolution.ok ? resolution.context : DEFAULT_SOLVER_CONTEXT;
}

export function readSolverContextResolution(): SolverContextResolution {
  if (typeof window === "undefined") return { ok: true, context: DEFAULT_SOLVER_CONTEXT };
  const raw =
    document.documentElement.dataset.challengeStandalone === "true"
      ? window.location.hash
      : window.location.search;
  if (!/(?:\?|&)space=/.test(raw)) return { ok: true, context: readLastActiveWorkspace() };
  return contextFromLocation(readSolverState());
}

export function useSolverContextResolution() {
  const [resolution, setResolution] = useState<SolverContextResolution | undefined>();
  useLayoutEffect(() => {
    const sync = () => setResolution(readSolverContextResolution());
    sync();
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    const unsubscribe = subscribeSolverState(sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
      unsubscribe();
    };
  }, []);
  return resolution;
}

export function useSolverContext() {
  const [context, setContext] = useState<ActiveWorkspace>(() =>
    typeof document !== "undefined" &&
    document.documentElement.dataset.challengeStandalone === "true"
      ? readSolverContext()
      : DEFAULT_SOLVER_CONTEXT,
  );
  useLayoutEffect(() => {
    const sync = () => setContext(readSolverContext());
    sync();
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    const unsubscribe = subscribeSolverState(sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
      unsubscribe();
    };
  }, []);
  return context;
}

export function useSolverSpace(): SolverSpace {
  return useSolverContext().type;
}

function entityScopedPath(path: string) {
  return /^\/app\/solver\/(?:proposals\/[^/]+|received-proposals\/[^/]+|cases\/[^/]+|teams\/[^/]+)/.test(
    path,
  );
}

function navigateToWorkspace(workspaceId: string) {
  const state = readSolverState();
  const target = activeWorkspaces(state).find((workspace) => workspace.workspaceId === workspaceId);
  if (!target) return;
  writeLastActiveWorkspace(target);
  const raw =
    document.documentElement.dataset.challengeStandalone === "true" &&
    window.location.hash.startsWith("#/")
      ? window.location.hash.slice(1)
      : `${window.location.pathname}${window.location.search}`;
  const currentPath = raw.split("?")[0] || "/app/solver/dashboard";
  const destination = entityScopedPath(currentPath) ? "/app/solver/dashboard" : currentPath;
  const href = buildSolverHref(destination, target, {
    notice: destination !== currentPath ? "workspace-changed" : undefined,
  });

  if (document.documentElement.dataset.challengeStandalone === "true") {
    window.location.hash = href;
  } else {
    window.location.assign(href);
  }
}

export function SolverWorkspaceShell({
  children,
  active,
  space,
  currentPath,
}: {
  children: ReactNode;
  active?: SolverSection;
  space: SolverSpace;
  currentPath?: string;
}) {
  const state = readSolverState();
  const context = readSolverContext();
  const effectiveContext = context.type === space ? context : DEFAULT_SOLVER_CONTEXT;
  const pendingCollaborationCount =
    effectiveContext.type === "individual"
      ? state.invitations.filter(
          (invitation) =>
            invitation.recipientUserId === state.currentUser.id &&
            ["sent", "viewed"].includes(invitation.state),
        ).length
      : state.membershipRequests.filter(
          (request) => request.teamId === effectiveContext.teamId && request.state === "requested",
        ).length;
  const navigation = useMemo(
    () =>
      (space === "team" ? teamNavigation : individualNavigation).map((item) => ({
        ...item,
        href: buildSolverHref(item.href.split("?")[0], effectiveContext),
        badge:
          item.key === "invitations" && pendingCollaborationCount > 0
            ? pendingCollaborationCount.toLocaleString("fa-IR")
            : undefined,
      })),
    [effectiveContext, pendingCollaborationCount, space],
  );
  const fallbackPath =
    navigation.find((item) => item.key === active)?.matches?.[0] ?? "/app/solver/dashboard";
  const team =
    effectiveContext.type === "team"
      ? state.teams.find((candidate) => candidate.id === effectiveContext.teamId)
      : undefined;
  const membership =
    effectiveContext.type === "team"
      ? state.memberships.find((candidate) => candidate.id === effectiveContext.membershipId)
      : undefined;
  const workspaceOptions = activeWorkspaces(state).map((workspace) => {
    if (workspace.type === "individual")
      return {
        id: workspace.workspaceId,
        label: state.personalWorkspace.name,
        description: "فضای شخصی",
        space: workspace.type,
      };
    const optionTeam = state.teams.find((candidate) => candidate.id === workspace.teamId);
    const optionMembership = state.memberships.find(
      (candidate) => candidate.id === workspace.membershipId,
    );
    return {
      id: workspace.workspaceId,
      label: optionTeam?.name ?? workspace.teamId,
      description: optionMembership ? TEAM_ROLE_LABELS[optionMembership.role] : "عضو تیم",
      space: workspace.type,
    };
  });
  return (
    <RoleAppShell
      role="solver"
      navigation={navigation}
      currentPath={currentPath ?? fallbackPath}
      account={{
        workspaceLabel: space === "team" ? "فضای تیمی حل‌کننده" : "فضای فردی حل‌کننده",
        workspaceName: team?.name ?? state.personalWorkspace.name,
        userName: state.currentUser.displayName,
        userRole: membership
          ? TEAM_ROLE_LABELS[membership.role]
          : (state.currentUser.headline ?? "حل‌کننده"),
      }}
      rootClassName="rh-shell"
      contentClassName="rh-main"
      space={space}
      workspaceOptions={workspaceOptions}
      activeWorkspaceId={effectiveContext.workspaceId}
      onWorkspaceChange={navigateToWorkspace}
      unreadCount={unreadNotificationCount(effectiveContext.workspaceId, state)}
      quickLinks={{
        opportunities: buildSolverHref("/app/solver/opportunities", effectiveContext),
        notifications: buildSolverHref("/app/solver/notifications", effectiveContext),
        profile: buildSolverHref("/app/solver/profile", effectiveContext),
      }}
    >
      {children}
    </RoleAppShell>
  );
}

export const SolverShell = SolverWorkspaceShell;
