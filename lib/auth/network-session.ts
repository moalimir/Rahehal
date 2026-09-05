import type { MeResource, WorkspaceResource } from "@rahhal/contracts";
import type { WorkspaceRole } from "@rahhal/domain";

import type { AppPersona } from "@/domain/persona";

/**
 * Which internal workspace a real, server-validated session is currently
 * acting in.
 *
 * The connected runtime used to be locked out of every `/app/*` page because
 * the internal shell gated on a `localStorage` demo session that a real OIDC
 * login never writes. This maps the authoritative `/me` answer onto the same
 * persona the shell already routes by, so one gate serves both runtimes and
 * the browser stops holding an opinion the server never gave it.
 *
 * The persona is derived from the *active workspace*, never from the route
 * prefix — `/app/org/...` proves nothing (70_SECURITY_AND_AUTHZ §3), and the
 * server re-authorizes every request regardless of what this returns.
 */
export type NetworkInternalSession = {
  readonly persona: AppPersona;
  readonly workspaceId: string;
  readonly workspaceName: string;
  readonly role: WorkspaceRole;
  readonly userId: string;
  readonly displayName: string;
};

/**
 * Platform staff share one operator workspace, so the persona comes from the
 * role rather than the workspace kind: a reviewer's queue is a different
 * product surface from operations' queues.
 */
function platformPersona(role: WorkspaceRole): AppPersona {
  return role === "platform:reviewer" ? "reviewer" : "ops";
}

export function personaForWorkspace(
  kind: WorkspaceResource["kind"],
  role: WorkspaceRole,
): AppPersona {
  if (kind === "org") return "org";
  if (kind === "platform") return platformPersona(role);
  return "solver";
}

export function networkInternalSession(me: MeResource | null): NetworkInternalSession | null {
  const active = me?.active_context;
  if (!me || !active) return null;

  const workspace = me.workspaces.find((candidate) => candidate.id === active.workspace_id);
  const membership = me.memberships.find(
    (candidate) => candidate.workspace_id === active.workspace_id && candidate.state === "active",
  );
  // An active context whose membership is gone or suspended is not a session
  // for this workspace. Failing closed here matches the server, which would
  // deny the next request anyway.
  if (!workspace || !membership) return null;

  return {
    persona: personaForWorkspace(workspace.kind, membership.role),
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    role: membership.role,
    userId: me.user.id,
    displayName: me.user.display_name,
  };
}

/** The workspaces this user could activate to reach the requested persona. */
export function workspacesForPersona(
  me: MeResource | null,
  persona: AppPersona,
): readonly WorkspaceResource[] {
  if (!me) return [];
  return me.workspaces.filter((workspace) => {
    const membership = me.memberships.find(
      (candidate) => candidate.workspace_id === workspace.id && candidate.state === "active",
    );
    return membership ? personaForWorkspace(workspace.kind, membership.role) === persona : false;
  });
}
