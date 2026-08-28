import type { ChallengeResource } from "@rahhal/contracts";
import {
  parseChallengeId,
  parseChallengeVersionId,
  parseMembershipId,
  parseSessionId,
  parseTenantId,
  parseUserId,
  parseWorkspaceId,
  type Membership,
  type OrganizationWorkspace,
  type User,
} from "@rahhal/domain";
import { InMemoryAccessDecisionAudit } from "./in-memory-audit.js";
import { InMemoryChallengeRepository } from "./in-memory-challenges.js";
import { InMemoryCriticalSection } from "./in-memory-critical-section.js";
import { InMemoryIdentityAdapter } from "./in-memory-identity.js";
import { MonotonicIdFactory, systemClock } from "./primitives.js";
import type { ApiPorts, Clock, DemoIdentitySeed, IdFactory } from "./ports.js";

export const demoApiCredentials = {
  owner: {
    accessToken: "demo-access-owner-alpha-0001",
    refreshToken: "demo-refresh-owner-alpha-0001",
    workspaceId: parseWorkspaceId("wsp_org_alpha"),
    sessionId: parseSessionId("ses_owner_alpha"),
  },
  approver: {
    accessToken: "demo-access-approver-alpha-01",
    refreshToken: "demo-refresh-approver-alpha-01",
    workspaceId: parseWorkspaceId("wsp_org_alpha"),
    sessionId: parseSessionId("ses_approver_alpha"),
  },
  foreignOwner: {
    accessToken: "demo-access-owner-beta-00001",
    refreshToken: "demo-refresh-owner-beta-00001",
    workspaceId: parseWorkspaceId("wsp_org_beta"),
    sessionId: parseSessionId("ses_owner_beta"),
  },
  exchange: {
    authorizationCode: "demo-oidc-code-owner-alpha",
    codeVerifier: "demo-code-verifier-owner-alpha-00000000000000000000",
    redirectUri: "http://localhost:3000/auth/callback",
    state: "demo-state-owner-alpha",
  },
} as const;

export const demoForeignChallengeId = parseChallengeId("chl_foreign_beta_001");

function organizationWorkspace(
  id: "wsp_org_alpha" | "wsp_org_beta",
  tenantId: "ten_alpha_org" | "ten_beta_org",
  name: string,
): OrganizationWorkspace {
  return { id: parseWorkspaceId(id), tenantId: parseTenantId(tenantId), kind: "org", name };
}

const ownerUser: User = {
  id: parseUserId("usr_owner_alpha"),
  displayName: "مالک سازمان آلفا",
  primaryEmail: "owner.alpha@example.test",
  emailVerified: true,
};

const approverUser: User = {
  id: parseUserId("usr_approver_alpha"),
  displayName: "تأییدکننده فنی آلفا",
  primaryEmail: "approver.alpha@example.test",
  emailVerified: true,
};

const foreignOwnerUser: User = {
  id: parseUserId("usr_owner_beta"),
  displayName: "مالک سازمان بتا",
  primaryEmail: "owner.beta@example.test",
  emailVerified: true,
};

const alphaWorkspace = organizationWorkspace("wsp_org_alpha", "ten_alpha_org", "سازمان آلفا");
const betaWorkspace = organizationWorkspace("wsp_org_beta", "ten_beta_org", "سازمان بتا");

function membership(
  id: string,
  user: User,
  workspace: OrganizationWorkspace,
  role: Membership["role"],
  now: string,
): Membership {
  return {
    id: parseMembershipId(id),
    tenantId: workspace.tenantId,
    workspaceId: workspace.id,
    userId: user.id,
    role,
    state: "active",
    createdAt: now,
    updatedAt: now,
  };
}

function demoSeeds(now: string): readonly DemoIdentitySeed[] {
  return [
    {
      user: ownerUser,
      workspace: alphaWorkspace,
      membership: membership("mem_owner_alpha", ownerUser, alphaWorkspace, "org:owner", now),
      authorizationCode: demoApiCredentials.exchange.authorizationCode,
      codeVerifier: demoApiCredentials.exchange.codeVerifier,
      redirectUri: demoApiCredentials.exchange.redirectUri,
      oidcState: demoApiCredentials.exchange.state,
      sessionId: demoApiCredentials.owner.sessionId,
      accessToken: demoApiCredentials.owner.accessToken,
      refreshToken: demoApiCredentials.owner.refreshToken,
    },
    {
      user: approverUser,
      workspace: alphaWorkspace,
      membership: membership(
        "mem_approver_alpha",
        approverUser,
        alphaWorkspace,
        "org:approver_technical",
        now,
      ),
      authorizationCode: "demo-oidc-code-approver-alpha",
      codeVerifier: "demo-code-verifier-approver-alpha-00000000000000000",
      redirectUri: demoApiCredentials.exchange.redirectUri,
      oidcState: "demo-state-approver-alpha",
      sessionId: demoApiCredentials.approver.sessionId,
      accessToken: demoApiCredentials.approver.accessToken,
      refreshToken: demoApiCredentials.approver.refreshToken,
    },
    {
      user: foreignOwnerUser,
      workspace: betaWorkspace,
      membership: membership("mem_owner_beta", foreignOwnerUser, betaWorkspace, "org:owner", now),
      authorizationCode: "demo-oidc-code-owner-beta",
      codeVerifier: "demo-code-verifier-owner-beta-000000000000000000000",
      redirectUri: demoApiCredentials.exchange.redirectUri,
      oidcState: "demo-state-owner-beta",
      sessionId: demoApiCredentials.foreignOwner.sessionId,
      accessToken: demoApiCredentials.foreignOwner.accessToken,
      refreshToken: demoApiCredentials.foreignOwner.refreshToken,
    },
  ];
}

function foreignChallenge(now: string): ChallengeResource {
  return {
    id: demoForeignChallengeId,
    current_version_id: parseChallengeVersionId("chv_foreign_beta_001"),
    tenant_id: betaWorkspace.tenantId,
    workspace_id: betaWorkspace.id,
    stage: "draft",
    authoring_status: "draft",
    version: 1,
    content_version: 1,
    readiness: { ready: false, evaluated_version: 1, issues: [] },
    content: {
      title: "چالش محرمانه سازمان بتا",
      summary: "",
      category: "",
      location: "",
      desired_outcome: "",
      current_state: "",
      consequence: "",
      expected_output: "",
      success_criteria: [],
      in_scope: "",
      constraints: "",
      organization_support: "",
      previous_attempts: "",
      output_type: null,
      sourcing_model: null,
      applicant_scope: null,
      allowed_applicant_types: [],
      work_mode: null,
      proposal_deadline: null,
      preferred_start_date: null,
      budget: { status: "undecided", amount_minor: null, currency: "IRR" },
      invitees: [],
      visibility: null,
      public_summary: "",
      nda_required: false,
      ip_terms: null,
      contact: { name: "", email: "", phone: "" },
      accuracy_confirmed: false,
      legal_notes: "",
      attachment_ids: [],
    },
    created_by: foreignOwnerUser.id,
    created_at: now,
    updated_at: now,
  };
}

export type DemoApiComposition = {
  readonly ports: ApiPorts;
  readonly identity: InMemoryIdentityAdapter;
  readonly challenges: InMemoryChallengeRepository;
  readonly decisionAudit: InMemoryAccessDecisionAudit;
  readonly criticalSection: InMemoryCriticalSection;
};

export function createDemoApiComposition(options: {
  readonly mode: string | undefined;
  readonly nodeEnv?: string | undefined;
  readonly clock?: Clock;
  readonly ids?: IdFactory;
  readonly identityBeforeCommit?: () => void;
}): DemoApiComposition {
  if (options.nodeEnv === "production" || options.mode !== "demo") {
    throw new Error(
      "The in-memory API composition is demo-only and refuses to run without RAHHAL_API_MODE=demo outside production",
    );
  }
  const clock = options.clock ?? systemClock;
  const ids = options.ids ?? new MonotonicIdFactory();
  const decisionAudit = new InMemoryAccessDecisionAudit();
  const criticalSection = new InMemoryCriticalSection();
  const identity = new InMemoryIdentityAdapter(
    demoSeeds(clock.now().toISOString()),
    clock,
    ids,
    decisionAudit,
    criticalSection,
    options.identityBeforeCommit,
  );
  const challenges = new InMemoryChallengeRepository(clock, ids);
  challenges.seed(foreignChallenge(clock.now().toISOString()));
  return {
    identity,
    challenges,
    decisionAudit,
    criticalSection,
    ports: {
      oidcAuthorization: {
        async start() {
          throw new Error("The demo API does not publish a real OIDC authorization flow");
        },
      },
      sessions: identity,
      workspaces: identity,
      authority: identity,
      challenges,
      decisionAudit,
      clock,
      ids,
    },
  };
}
