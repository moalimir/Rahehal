"use client";

import type { ReactNode } from "react";
import { lazy, Suspense, useCallback, useState } from "react";
import dynamic from "next/dynamic";

import { PermissionDenied, ProductNotFound, RouteResolving } from "@/components/route-fallbacks";
import { useWebRuntime } from "@/components/runtime-provider";
import { ConfiguredRoleShell } from "@/components/role-shells";
import type { InternalRoute } from "@/data/internal-routes";
import { networkInternalSession, workspacesForPersona } from "@/lib/auth/network-session";
import type { DemoSession } from "@/lib/auth/session";

const ConnectedReviewAssignments = dynamic(
  () =>
    import("@/components/internal/connected-review-assignments").then(
      (module) => module.ConnectedReviewAssignments,
    ),
  { loading: RouteResolving },
);
const PlatformApprovalQueue = lazy(() =>
  import("@/components/platform-approval-queue").then((module) => ({
    default: module.PlatformApprovalQueue,
  })),
);

function WorkspaceActivationRequired({
  workspaces,
  switching,
  error,
  onActivate,
}: {
  workspaces: readonly { readonly id: string; readonly name: string }[];
  switching: boolean;
  error: string;
  onActivate: (workspaceId: string) => void;
}) {
  return (
    <main className="route-fallback" id="main-content">
      <p className="route-fallback__eyebrow">فضای کاری</p>
      <h1>فضای کاری مرتبط را فعال کنید</h1>
      <p>حساب شما به این بخش دسترسی دارد، اما فضای کاری فعال فعلی شما این بخش نیست.</p>
      <div className="route-fallback__actions">
        {workspaces.map((workspace) => (
          <button
            key={workspace.id}
            type="button"
            className="app-button app-button--primary"
            disabled={switching}
            onClick={() => onActivate(workspace.id)}
          >
            {workspace.name}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="route-fallback__error">
          {error}
        </p>
      )}
    </main>
  );
}

export function NetworkInternalBoundary({
  route,
  children,
}: {
  route: InternalRoute;
  children: (session: DemoSession | null | undefined) => ReactNode;
}) {
  const runtime = useWebRuntime();
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState("");
  const activate = useCallback(
    (workspaceId: string) => {
      setSwitching(true);
      setError("");
      void runtime.switchWorkspace(workspaceId).then((problem) => {
        setSwitching(false);
        setError(problem?.message ?? "");
      });
    },
    [runtime],
  );

  // Connected assignments are exact server resources on the authoritative
  // queue. Legacy fixture-ID pages use browser COI and demo scoring, so never
  // render them as a fallback for a connected reviewer deep link.
  if (route.role === "reviewer" && route.path.startsWith("/app/reviewer/assignments/")) {
    return <ProductNotFound requestedPath={route.path} />;
  }

  if (route.path === "/app/ops/publication") {
    return (
      <ConfiguredRoleShell role="ops" currentPath={route.path}>
        <Suspense fallback={<RouteResolving />}>
          <PlatformApprovalQueue />
        </Suspense>
      </ConfiguredRoleShell>
    );
  }

  const networkSession = networkInternalSession(runtime.me);
  if (runtime.sessionStatus === "authenticated") {
    const reachable = workspacesForPersona(runtime.me, route.role);
    if (!networkSession || networkSession.persona !== route.role) {
      if (reachable.length === 0) return <PermissionDenied />;
      return (
        <WorkspaceActivationRequired
          workspaces={reachable}
          switching={switching}
          error={error}
          onActivate={activate}
        />
      );
    }
  }

  if (networkSession?.persona === "reviewer" && route.path === "/app/reviewer/assignments") {
    return (
      <ConfiguredRoleShell role="reviewer" currentPath={route.path}>
        <ConnectedReviewAssignments view="reviewer" />
      </ConfiguredRoleShell>
    );
  }
  if (networkSession?.role === "platform:ops" && route.path === "/app/ops/reviews") {
    return (
      <ConfiguredRoleShell role="ops" currentPath={route.path}>
        <ConnectedReviewAssignments view="operations" />
      </ConfiguredRoleShell>
    );
  }

  return children(
    networkSession
      ? {
          version: 2,
          userId: networkSession.userId,
          role: networkSession.persona,
          workspaceId: networkSession.workspaceId,
          twoFactorVerified: true,
          expiresAt: Number.POSITIVE_INFINITY,
        }
      : runtime.sessionStatus === "loading"
        ? undefined
        : null,
  );
}
