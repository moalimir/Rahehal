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
  type Workspace,
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
  publisher: {
    accessToken: "demo-access-publisher-alpha-1",
    refreshToken: "demo-refresh-publisher-alpha-1",
    workspaceId: parseWorkspaceId("wsp_org_alpha"),
    sessionId: parseSessionId("ses_publisher_alpha"),
  },
  foreignOwner: {
    accessToken: "demo-access-owner-beta-00001",
    refreshToken: "demo-refresh-owner-beta-00001",
    workspaceId: parseWorkspaceId("wsp_org_beta"),
    sessionId: parseSessionId("ses_owner_beta"),
  },
  platformOps: {
    accessToken: "demo-access-platform-ops-001",
    refreshToken: "demo-refresh-platform-ops-001",
    workspaceId: parseWorkspaceId("wsp_platform_main"),
    sessionId: parseSessionId("ses_platform_ops"),
  },
  platformFinance: {
    accessToken: "demo-access-platform-finance",
    refreshToken: "demo-refresh-platform-finance",
    workspaceId: parseWorkspaceId("wsp_platform_main"),
    sessionId: parseSessionId("ses_platform_finance"),
  },
  platformLegal: {
    accessToken: "demo-access-platform-legal-01",
    refreshToken: "demo-refresh-platform-legal-01",
    workspaceId: parseWorkspaceId("wsp_platform_main"),
    sessionId: parseSessionId("ses_platform_legal"),
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

const publisherUser: User = {
  id: parseUserId("usr_publisher_alpha"),
  displayName: "منتشرکننده آلفا",
  primaryEmail: "publisher.alpha@example.test",
  emailVerified: true,
};

const foreignOwnerUser: User = {
  id: parseUserId("usr_owner_beta"),
  displayName: "مالک سازمان بتا",
  primaryEmail: "owner.beta@example.test",
  emailVerified: true,
};

const platformOpsUser: User = {
  id: parseUserId("usr_platform_ops"),
  displayName: "کارشناس عملیات پلتفرم",
  primaryEmail: "platform.ops@example.test",
  emailVerified: true,
};

const platformFinanceUser: User = {
  id: parseUserId("usr_platform_finance"),
  displayName: "کارشناس مالی پلتفرم",
  primaryEmail: "platform.finance@example.test",
  emailVerified: true,
};

const platformLegalUser: User = {
  id: parseUserId("usr_platform_legal"),
  displayName: "کارشناس حقوقی پلتفرم",
  primaryEmail: "platform.legal@example.test",
  emailVerified: true,
};

const alphaWorkspace = organizationWorkspace("wsp_org_alpha", "ten_alpha_org", "سازمان آلفا");
const betaWorkspace = organizationWorkspace("wsp_org_beta", "ten_beta_org", "سازمان بتا");
const platformWorkspace: Workspace = {
  id: parseWorkspaceId("wsp_platform_main"),
  tenantId: parseTenantId("ten_platform"),
  kind: "platform",
  name: "پلتفرم راه‌حل",
};

function membership(
  id: string,
  user: User,
  workspace: Workspace,
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
      user: publisherUser,
      workspace: alphaWorkspace,
      membership: membership(
        "mem_publisher_alpha",
        publisherUser,
        alphaWorkspace,
        "org:publisher",
        now,
      ),
      authorizationCode: "demo-oidc-code-publisher-alpha",
      codeVerifier: "demo-code-verifier-publisher-alpha-0000000000000000",
      redirectUri: demoApiCredentials.exchange.redirectUri,
      oidcState: "demo-state-publisher-alpha",
      sessionId: demoApiCredentials.publisher.sessionId,
      accessToken: demoApiCredentials.publisher.accessToken,
      refreshToken: demoApiCredentials.publisher.refreshToken,
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
    {
      user: platformOpsUser,
      workspace: platformWorkspace,
      membership: membership(
        "mem_platform_ops",
        platformOpsUser,
        platformWorkspace,
        "platform:ops",
        now,
      ),
      authorizationCode: "demo-oidc-code-platform-ops",
      codeVerifier: "demo-code-verifier-platform-ops-0000000000000000000",
      redirectUri: demoApiCredentials.exchange.redirectUri,
      oidcState: "demo-state-platform-ops",
      sessionId: demoApiCredentials.platformOps.sessionId,
      accessToken: demoApiCredentials.platformOps.accessToken,
      refreshToken: demoApiCredentials.platformOps.refreshToken,
    },
    {
      user: platformFinanceUser,
      workspace: platformWorkspace,
      membership: membership(
        "mem_platform_finance",
        platformFinanceUser,
        platformWorkspace,
        "platform:finance",
        now,
      ),
      authorizationCode: "demo-oidc-code-platform-finance",
      codeVerifier: "demo-code-verifier-platform-finance-000000000000000",
      redirectUri: demoApiCredentials.exchange.redirectUri,
      oidcState: "demo-state-platform-finance",
      sessionId: demoApiCredentials.platformFinance.sessionId,
      accessToken: demoApiCredentials.platformFinance.accessToken,
      refreshToken: demoApiCredentials.platformFinance.refreshToken,
    },
    {
      user: platformLegalUser,
      workspace: platformWorkspace,
      membership: membership(
        "mem_platform_legal",
        platformLegalUser,
        platformWorkspace,
        "platform:legal",
        now,
      ),
      authorizationCode: "demo-oidc-code-platform-legal",
      codeVerifier: "demo-code-verifier-platform-legal-00000000000000000",
      redirectUri: demoApiCredentials.exchange.redirectUri,
      oidcState: "demo-state-platform-legal",
      sessionId: demoApiCredentials.platformLegal.sessionId,
      accessToken: demoApiCredentials.platformLegal.accessToken,
      refreshToken: demoApiCredentials.platformLegal.refreshToken,
    },
  ];
}

function foreignChallenge(now: string): ChallengeResource {
  return {
    id: demoForeignChallengeId,
    current_version_id: parseChallengeVersionId("chv_foreign_beta_001"),
    published_version_id: null,
    tenant_id: betaWorkspace.tenantId,
    workspace_id: betaWorkspace.id,
    stage: "draft",
    authoring_status: "draft",
    version: 1,
    content_version: 1,
    readiness: { ready: false, evaluated_version: 1, issues: [] },
    approvals: [],
    publication_readiness: {
      ready: false,
      satisfied: [],
      missing: ["technical", "legal", "finance", "quality"],
    },
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
      verification_required: false,
      nda_required: false,
      document_gate_required: false,
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
