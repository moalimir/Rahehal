"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  browserSessionRoutes,
  type BrowserOidcAuthorizationStartSuccessEnvelope,
  type ErrorEnvelope,
  type MeResource,
  type MeSuccessEnvelope,
  type MutationSuccessEnvelope,
} from "@rahhal/contracts";
import type { ChallengeGateway } from "@/lib/challenges/gateway";
import { createNetworkChallengeGateway } from "@/lib/challenges/adapters/network";
import { demoChallengeGateway } from "@/lib/challenges/runtime";
import { createNetworkChallengeGovernanceGateway } from "@/lib/challenges/adapters/network-governance";
import type { ChallengeGovernanceGateway } from "@/lib/challenges/governance";
import { idempotencyKey, requestApi } from "@/lib/api/http";
import { webRuntimeMode, type WebRuntimeMode } from "@/lib/runtime/mode";

export type NetworkSessionStatus = "demo" | "loading" | "anonymous" | "authenticated" | "error";

type WebRuntimeContextValue = {
  readonly mode: WebRuntimeMode;
  readonly challengeGateway: ChallengeGateway;
  /** Null in demo mode: attributed publication gates exist only server-side. */
  readonly governanceGateway: ChallengeGovernanceGateway | null;
  readonly sessionStatus: NetworkSessionStatus;
  readonly me: MeResource | null;
  readonly sessionVersion: number | null;
  readonly sessionError: ErrorEnvelope["error"] | null;
  refreshMe(): Promise<boolean>;
  startOrganizationLogin(): Promise<ErrorEnvelope["error"] | null>;
  switchWorkspace(workspaceId: string): Promise<ErrorEnvelope["error"] | null>;
  signOut(): Promise<void>;
};

const WebRuntimeContext = createContext<WebRuntimeContextValue | null>(null);

const standaloneDemoRuntime: WebRuntimeContextValue = {
  mode: "demo",
  challengeGateway: demoChallengeGateway,
  governanceGateway: null,
  sessionStatus: "demo",
  me: null,
  sessionVersion: null,
  sessionError: null,
  refreshMe: async () => true,
  startOrganizationLogin: async () => null,
  switchWorkspace: async () => null,
  signOut: async () => undefined,
};

export function RuntimeProvider({ children }: { children: ReactNode }) {
  const network = webRuntimeMode === "network";
  const [sessionStatus, setSessionStatus] = useState<NetworkSessionStatus>(
    network ? "loading" : "demo",
  );
  const [me, setMe] = useState<MeResource | null>(null);
  const [sessionVersion, setSessionVersion] = useState<number | null>(null);
  const [sessionError, setSessionError] = useState<ErrorEnvelope["error"] | null>(null);
  const commandKeysRef = useRef(new Map<string, string>());
  // The gateway reads the active workspace at request time, never at render time,
  // so the mutable scope and the gateway that closes over it are created together.
  const [{ scope, challengeGateway, governanceGateway }] = useState(() => {
    const workspaceScope: { activeWorkspaceId: string | null } = { activeWorkspaceId: null };
    const activeWorkspaceId = () => workspaceScope.activeWorkspaceId;
    return {
      scope: workspaceScope,
      challengeGateway: network
        ? createNetworkChallengeGateway({ activeWorkspaceId })
        : demoChallengeGateway,
      // The demo store has no attributed-gate model, so governance is
      // deliberately unavailable there rather than simulated.
      governanceGateway: network
        ? createNetworkChallengeGovernanceGateway({ activeWorkspaceId })
        : null,
    };
  });

  const refreshMe = useCallback(async () => {
    if (!network) return true;
    const result = await requestApi<MeSuccessEnvelope>("/api/v1/me");
    if (!result.ok) {
      setMe(null);
      setSessionVersion(null);
      scope.activeWorkspaceId = null;
      setSessionError(result.error);
      setSessionStatus(result.error.code === "NO_ACCESS" ? "anonymous" : "error");
      return false;
    }
    setMe(result.data);
    setSessionVersion(result.meta.entity_version);
    scope.activeWorkspaceId = result.data.active_context?.workspace_id ?? null;
    setSessionError(null);
    setSessionStatus("authenticated");
    return true;
  }, [network, scope]);

  useEffect(() => {
    if (network) void refreshMe();
  }, [network, refreshMe]);

  const startOrganizationLogin = useCallback(async () => {
    if (!network) return null;
    const command = "oidc-start";
    const key = commandKeysRef.current.get(command) ?? idempotencyKey("web-oidc-start");
    commandKeysRef.current.set(command, key);
    const result = await requestApi<BrowserOidcAuthorizationStartSuccessEnvelope>(
      browserSessionRoutes.oidcAuthorizationStart,
      {
        method: "POST",
        headers: { "idempotency-key": key },
        body: JSON.stringify({ expected_version: 0 }),
      },
    );
    if (!result.ok) return result.error;
    window.location.assign(result.data.authorization_url);
    return null;
  }, [network]);

  const switchWorkspace = useCallback(
    async (workspaceId: string) => {
      if (!network || sessionVersion === null) return null;
      const command = `workspace:${sessionVersion}:${workspaceId}`;
      const key = commandKeysRef.current.get(command) ?? idempotencyKey("web-workspace-switch");
      commandKeysRef.current.set(command, key);
      const result = await requestApi<MutationSuccessEnvelope>("/api/v1/me/context:switch", {
        method: "POST",
        headers: { "idempotency-key": key },
        body: JSON.stringify({ expected_version: sessionVersion, workspace_id: workspaceId }),
      });
      if (!result.ok) {
        setSessionError(result.error);
        return result.error;
      }
      commandKeysRef.current.delete(command);
      await refreshMe();
      return null;
    },
    [network, refreshMe, sessionVersion],
  );

  const signOut = useCallback(async () => {
    if (!network) return;
    await requestApi<MutationSuccessEnvelope>(browserSessionRoutes.sessionRevoke, {
      method: "POST",
      headers: { "idempotency-key": idempotencyKey("web-session-revoke") },
      body: JSON.stringify({}),
    });
    setMe(null);
    setSessionVersion(null);
    scope.activeWorkspaceId = null;
    setSessionError(null);
    setSessionStatus("anonymous");
  }, [network, scope]);

  const value = useMemo<WebRuntimeContextValue>(
    () => ({
      mode: webRuntimeMode,
      challengeGateway,
      governanceGateway,
      sessionStatus,
      me,
      sessionVersion,
      sessionError,
      refreshMe,
      startOrganizationLogin,
      switchWorkspace,
      signOut,
    }),
    [
      challengeGateway,
      governanceGateway,
      me,
      refreshMe,
      sessionError,
      sessionStatus,
      sessionVersion,
      signOut,
      startOrganizationLogin,
      switchWorkspace,
    ],
  );

  return <WebRuntimeContext.Provider value={value}>{children}</WebRuntimeContext.Provider>;
}

export function useWebRuntime(): WebRuntimeContextValue {
  const runtime = useContext(WebRuntimeContext);
  if (!runtime) {
    if (webRuntimeMode === "network") {
      throw new Error(
        "The network web runtime requires RuntimeProvider; demo fallback is forbidden",
      );
    }
    return standaloneDemoRuntime;
  }
  return runtime;
}

export function useChallengeGateway(): ChallengeGateway {
  return useWebRuntime().challengeGateway;
}

/**
 * Null in demo mode. Callers must render an explicit unavailable state rather
 * than falling back to a local store: attributed publication gates and the
 * publish transaction are server authority, and simulating either in the
 * browser is exactly the fallback AGENTS.md forbids.
 */
export function useChallengeGovernance(): ChallengeGovernanceGateway | null {
  return useWebRuntime().governanceGateway;
}
