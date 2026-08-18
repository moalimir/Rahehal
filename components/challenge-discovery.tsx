"use client";

import { ChallengeDetail } from "@/components/challenge-discovery/challenge-detail";
import { ChallengeDirectory } from "@/components/challenge-discovery/challenge-directory";
import { challengeDiscoveryPaths } from "@/components/challenge-discovery/catalog";
import {
  SolverWorkspaceShell,
  useSolverContext,
  useSolverSpace,
  type SolverSpace,
} from "@/components/solver-shell";
import { SiteHeader } from "@/components/site-header";
import { PublicFooter } from "@/components/site-footer";
import { buildSolverHref } from "@/lib/solver/context";
import { activeWorkspaces, readSolverState } from "@/lib/solver/repository";

export { challengeDiscoveryPaths };

export function ChallengeDiscoveryApp({
  challengeKey,
  embedded = false,
  publicMode = false,
  space: suppliedSpace,
}: {
  challengeKey?: string;
  embedded?: boolean;
  publicMode?: boolean;
  space?: SolverSpace;
}) {
  const currentSpace = useSolverSpace();
  const currentContext = useSolverContext();
  const space = suppliedSpace ?? currentSpace;
  const state = readSolverState();
  const context =
    currentContext.type === space
      ? currentContext
      : space === "team"
        ? (activeWorkspaces(state).find((workspace) => workspace.type === "team") ?? currentContext)
        : ({ type: "individual", workspaceId: state.personalWorkspace.id } as const);
  const basePath = embedded ? "/app/solver/opportunities" : "/challenges";
  const contextQuery = embedded ? buildSolverHref("/", context).replace(/^\/\?/, "?") : "";
  const content = challengeKey ? (
    <ChallengeDetail
      challengeKey={challengeKey}
      basePath={basePath}
      requiresAuth={publicMode}
      activeContext={context}
      contextQuery={contextQuery}
    />
  ) : (
    <ChallengeDirectory
      basePath={basePath}
      contextQuery={contextQuery}
      workspaceId={context.workspaceId}
    />
  );
  if (publicMode) {
    return (
      <div className="public-challenge-shell">
        <SiteHeader />
        <main id="main-content" className="public-challenge-main">
          {content}
        </main>
        <PublicFooter />
      </div>
    );
  }
  if (embedded) return content;
  return (
    <SolverWorkspaceShell active="challenges" currentPath="/app/solver/opportunities" space={space}>
      {content}
    </SolverWorkspaceShell>
  );
}
