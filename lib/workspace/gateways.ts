import type {
  MutationSuccessEnvelope,
  NotificationListResource,
  NotificationListSuccessEnvelope,
  NotificationSummaryResource,
  NotificationSummarySuccessEnvelope,
  OrganizationProposalInboxResource,
  OrganizationProposalInboxSuccessEnvelope,
  OrganizationProposalResource,
  OrganizationProposalSuccessEnvelope,
  ProposalListResource,
  ProposalListSuccessEnvelope,
  ProposalResource,
  ProposalSuccessEnvelope,
  SolverWorkspaceProfileResource,
  SolverWorkspaceProfileSuccessEnvelope,
  TeamResource,
  TeamSuccessEnvelope,
} from "@rahhal/contracts";
import { apiRoutes } from "@rahhal/contracts";

import { idempotencyKey, requestApi } from "@/lib/api/http";
import { toResult, type GatewayResult } from "@/lib/api/result";

/**
 * The connected gateways C9 puts in front of every workspace page family.
 *
 * Each one reads the active workspace at request time through the injected
 * resolver rather than closing over a render-time value, so switching
 * workspaces changes scope for in-flight pages without rebuilding the tree.
 * None of them touch `localStorage`, `sessionStorage`, or the demo repository:
 * in network mode the server is the only authority.
 */
export type WorkspaceScopeResolver = {
  readonly activeWorkspaceId: () => string | null;
};

function headers(scope: WorkspaceScopeResolver, command?: string): HeadersInit {
  const workspaceId = scope.activeWorkspaceId();
  return {
    ...(workspaceId ? { "x-workspace-id": workspaceId } : {}),
    ...(command ? { "idempotency-key": idempotencyKey(command) } : {}),
  };
}

function path(template: string, replacements: Readonly<Record<string, string>>): string {
  return Object.entries(replacements).reduce(
    (result, [token, value]) => result.replace(`{${token}}`, encodeURIComponent(value)),
    template,
  );
}

// ---------------------------------------------------------------- C1 profile

export type SolverProfileGateway = {
  read(): Promise<GatewayResult<SolverWorkspaceProfileResource>>;
};

export function createSolverProfileGateway(scope: WorkspaceScopeResolver): SolverProfileGateway {
  return {
    async read() {
      const envelope = await requestApi<SolverWorkspaceProfileSuccessEnvelope>(
        apiRoutes.solverProfile,
        { headers: headers(scope) },
      );
      return toResult(envelope, (data) => data as SolverWorkspaceProfileResource);
    },
  };
}

// ------------------------------------------------------------------ C2 teams

export type TeamGateway = {
  read(): Promise<GatewayResult<TeamResource>>;
};

export function createTeamGateway(scope: WorkspaceScopeResolver): TeamGateway {
  return {
    async read() {
      const envelope = await requestApi<TeamSuccessEnvelope>(apiRoutes.solverTeam, {
        headers: headers(scope),
      });
      return toResult(envelope, (data) => data as TeamResource);
    },
  };
}

// ------------------------------------------------------------- C3–C5 proposals

export type ProposalGateway = {
  list(): Promise<GatewayResult<ProposalListResource>>;
  get(proposalId: string): Promise<GatewayResult<ProposalResource>>;
  create(input: {
    readonly challengeId: string;
  }): Promise<GatewayResult<MutationSuccessEnvelope["data"]>>;
  patch(
    proposalId: string,
    input: {
      readonly expectedVersion: number;
      readonly patch: Readonly<Record<string, unknown>>;
    },
  ): Promise<GatewayResult<MutationSuccessEnvelope["data"]>>;
  submit(
    proposalId: string,
    input: {
      readonly expectedVersion: number;
      readonly acceptedChallengeVersionId: string;
    },
  ): Promise<GatewayResult<MutationSuccessEnvelope["data"]>>;
};

export function createProposalGateway(scope: WorkspaceScopeResolver): ProposalGateway {
  return {
    async list() {
      const envelope = await requestApi<ProposalListSuccessEnvelope>(apiRoutes.proposals, {
        headers: headers(scope),
      });
      return toResult(envelope, (data) => data as ProposalListResource);
    },
    async get(proposalId) {
      const envelope = await requestApi<ProposalSuccessEnvelope>(
        path(apiRoutes.proposalById, { proposalId }),
        { headers: headers(scope) },
      );
      return toResult(envelope, (data) => data as ProposalResource);
    },
    async create({ challengeId }) {
      const envelope = await requestApi<MutationSuccessEnvelope>(apiRoutes.proposals, {
        method: "POST",
        headers: headers(scope, "proposal-create"),
        body: JSON.stringify({ expected_version: 0, challenge_id: challengeId }),
      });
      return toResult(envelope, (data) => data as MutationSuccessEnvelope["data"]);
    },
    async patch(proposalId, { expectedVersion, patch }) {
      const envelope = await requestApi<MutationSuccessEnvelope>(
        path(apiRoutes.proposalById, { proposalId }),
        {
          method: "PATCH",
          headers: headers(scope, "proposal-patch"),
          body: JSON.stringify({ expected_version: expectedVersion, patch }),
        },
      );
      return toResult(envelope, (data) => data as MutationSuccessEnvelope["data"]);
    },
    async submit(proposalId, { expectedVersion, acceptedChallengeVersionId }) {
      const envelope = await requestApi<MutationSuccessEnvelope>(
        path(apiRoutes.submitProposal, { proposalId }),
        {
          method: "POST",
          headers: headers(scope, "proposal-submit"),
          body: JSON.stringify({
            expected_version: expectedVersion,
            accepted_challenge_version_id: acceptedChallengeVersionId,
          }),
        },
      );
      return toResult(envelope, (data) => data as MutationSuccessEnvelope["data"]);
    },
  };
}

// ------------------------------------------------- C4 organization proposal reads

export type OrganizationProposalGateway = {
  inbox(): Promise<GatewayResult<OrganizationProposalInboxResource>>;
  get(proposalId: string): Promise<GatewayResult<OrganizationProposalResource>>;
};

export function createOrganizationProposalGateway(
  scope: WorkspaceScopeResolver,
): OrganizationProposalGateway {
  return {
    async inbox() {
      const envelope = await requestApi<OrganizationProposalInboxSuccessEnvelope>(
        apiRoutes.organizationProposalInbox,
        {
          headers: headers(scope),
        },
      );
      return toResult(envelope, (data) => data as OrganizationProposalInboxResource);
    },
    async get(proposalId) {
      const envelope = await requestApi<OrganizationProposalSuccessEnvelope>(
        path(apiRoutes.organizationProposalById, { proposalId }),
        { headers: headers(scope) },
      );
      return toResult(envelope, (data) => data as OrganizationProposalResource);
    },
  };
}

// ---------------------------------------------------------- C8 notifications

export type NotificationGateway = {
  list(query?: {
    readonly limit?: number;
    readonly cursor?: string;
    readonly unreadOnly?: boolean;
  }): Promise<GatewayResult<NotificationListResource>>;
  summary(): Promise<GatewayResult<NotificationSummaryResource>>;
  markRead(notificationId: string): Promise<GatewayResult<MutationSuccessEnvelope["data"]>>;
  markAllRead(): Promise<GatewayResult<MutationSuccessEnvelope["data"]>>;
};

export function createNotificationGateway(scope: WorkspaceScopeResolver): NotificationGateway {
  return {
    async list(query = {}) {
      const search = new URLSearchParams();
      if (query.limit !== undefined) search.set("limit", String(query.limit));
      if (query.cursor !== undefined) search.set("cursor", query.cursor);
      if (query.unreadOnly) search.set("unread_only", "true");
      const suffix = search.size > 0 ? `?${search.toString()}` : "";
      const envelope = await requestApi<NotificationListSuccessEnvelope>(
        `${apiRoutes.notifications}${suffix}`,
        {
          headers: headers(scope),
        },
      );
      return toResult(envelope, (data) => data as NotificationListResource);
    },
    async summary() {
      const envelope = await requestApi<NotificationSummarySuccessEnvelope>(
        apiRoutes.notificationSummary,
        {
          headers: headers(scope),
        },
      );
      return toResult(envelope, (data) => data as NotificationSummaryResource);
    },
    async markRead(notificationId) {
      const envelope = await requestApi<MutationSuccessEnvelope>(
        path(apiRoutes.markNotificationRead, { notificationId }),
        {
          method: "POST",
          headers: headers(scope, "notification-read"),
          body: JSON.stringify({ expected_version: 0 }),
        },
      );
      return toResult(envelope, (data) => data as MutationSuccessEnvelope["data"]);
    },
    async markAllRead() {
      const envelope = await requestApi<MutationSuccessEnvelope>(
        apiRoutes.markAllNotificationsRead,
        {
          method: "POST",
          headers: headers(scope, "notification-read-all"),
          body: JSON.stringify({ expected_version: 0 }),
        },
      );
      return toResult(envelope, (data) => data as MutationSuccessEnvelope["data"]);
    },
  };
}

export type WorkspaceGateways = {
  readonly solverProfile: SolverProfileGateway;
  readonly team: TeamGateway;
  readonly proposals: ProposalGateway;
  readonly organizationProposals: OrganizationProposalGateway;
  readonly notifications: NotificationGateway;
};

export function createWorkspaceGateways(scope: WorkspaceScopeResolver): WorkspaceGateways {
  return {
    solverProfile: createSolverProfileGateway(scope),
    team: createTeamGateway(scope),
    proposals: createProposalGateway(scope),
    organizationProposals: createOrganizationProposalGateway(scope),
    notifications: createNotificationGateway(scope),
  };
}
