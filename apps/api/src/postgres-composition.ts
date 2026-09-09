import { PostgresRubricAdapter } from "./postgres/rubrics.js";
import { PostgresEvaluationAdapter } from "./postgres/evaluations.js";
import { PostgresReviewAdapter } from "./postgres/reviews.js";
import { Pool } from "pg";

import { RandomIdFactory, systemClock } from "./primitives.js";
import {
  DevelopmentContactVerificationAdapter,
  developmentContactVerificationSettings,
} from "./development-contact-verification.js";
import type {
  ApiPorts,
  Clock,
  IdFactory,
  OidcExchangePort,
  OidcAuthorizationPort,
  SessionCredentialIssuerPort,
} from "./ports.js";
import { PostgresAccessDecisionAudit } from "./postgres/access-decision-audit.js";
import { PostgresChallengeAdapter } from "./postgres/challenges.js";
import { databasePoolConfig } from "./postgres/config.js";
import { PostgresIdentityWorkspaceAdapter } from "./postgres/identity-workspace.js";
import { PostgresOpportunityAdapter } from "./postgres/opportunities.js";
import { PostgresPublicChallengeAdapter } from "./postgres/public-challenges.js";
import { PostgresProposalAdapter } from "./postgres/proposals.js";
import { PostgresSolverWorkspaceAdapter } from "./postgres/solver-workspaces.js";
import { PostgresSolverActivationAdapter } from "./postgres/solver-activation.js";
import { PostgresTeamAdapter } from "./postgres/teams.js";
import {
  oidcRuntimeSettings,
  PostgresOidcAuthorizationAdapter,
} from "./postgres/oidc-authorization.js";
import { PostgresNotificationAdapter } from "./postgres/notifications.js";
import { PostgresUnitOfWork } from "./postgres/unit-of-work.js";
import { HmacSessionCredentialIssuer } from "./session-credentials.js";

// D1 review reads require the complete review foundation schema.
const requiredMigration = "0026_d5_review_coi";

type OidcAdapter = OidcExchangePort & OidcAuthorizationPort;

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required for PostgreSQL API composition`);
  return value;
}

export type PostgresApiComposition = {
  readonly ports: ApiPorts;
  readonly pool: Pool;
  readonly unitOfWork: PostgresUnitOfWork;
  close(): Promise<void>;
};

export async function createPostgresApiComposition(
  options: {
    readonly pool?: Pool;
    readonly environment?: NodeJS.ProcessEnv;
    readonly clock?: Clock;
    readonly ids?: IdFactory;
    readonly oidc?: OidcAdapter;
    readonly credentials?: SessionCredentialIssuerPort;
    readonly beforeCommit?: () => void | Promise<void>;
  } = {},
): Promise<PostgresApiComposition> {
  const ownsPool = options.pool === undefined;
  const environment = options.environment ?? process.env;
  if (environment.NODE_ENV === "production") {
    throw new Error(
      "The A2 PostgreSQL composition uses a local test identity provider and refuses production",
    );
  }
  const clock = options.clock ?? systemClock;
  const ids = options.ids ?? new RandomIdFactory();
  const settings = options.oidc ? undefined : oidcRuntimeSettings(environment);
  const contactVerificationSettings = developmentContactVerificationSettings(environment);
  const credentials =
    options.credentials ??
    new HmacSessionCredentialIssuer(required(environment, "SESSION_CREDENTIAL_SECRET"));
  const pool = options.pool ?? new Pool(databasePoolConfig(environment));

  try {
    const readiness = await pool.query<{ ready: boolean }>(
      `
        SELECT EXISTS (
          SELECT 1 FROM schema_migration WHERE id = $1
        ) AS ready
      `,
      [requiredMigration],
    );
    if (readiness.rows[0]?.ready !== true) {
      throw new Error(
        `PostgreSQL is missing required migration ${requiredMigration}; run database setup before the API`,
      );
    }
  } catch (error) {
    if (ownsPool) await pool.end();
    throw error;
  }

  const unitOfWork = new PostgresUnitOfWork(pool, options.beforeCommit);
  const decisionAudit = new PostgresAccessDecisionAudit(unitOfWork, ids);
  const oidc =
    options.oidc ?? new PostgresOidcAuthorizationAdapter(unitOfWork, settings!, clock, ids);
  const identity = new PostgresIdentityWorkspaceAdapter(
    unitOfWork,
    oidc,
    credentials,
    clock,
    ids,
    decisionAudit,
  );
  const contactVerification = new DevelopmentContactVerificationAdapter(
    contactVerificationSettings,
    clock,
    ids,
  );
  const challenges = new PostgresChallengeAdapter(unitOfWork, clock, ids);
  const publicChallenges = new PostgresPublicChallengeAdapter(unitOfWork);
  const solverWorkspaces = new PostgresSolverWorkspaceAdapter(unitOfWork, clock, ids);
  const solverActivation = new PostgresSolverActivationAdapter(
    unitOfWork,
    contactVerification,
    credentials,
    clock,
    ids,
  );
  const teams = new PostgresTeamAdapter(unitOfWork, clock, ids);
  const notifications = new PostgresNotificationAdapter(unitOfWork, clock, ids);
  const proposals = new PostgresProposalAdapter(unitOfWork, teams, clock, ids);
  const opportunities = new PostgresOpportunityAdapter(unitOfWork, teams, clock, ids);

  return {
    pool,
    unitOfWork,
    ports: {
      evaluations: new PostgresEvaluationAdapter(unitOfWork, ids),
      reviews: new PostgresReviewAdapter(unitOfWork, ids),
      rubrics: new PostgresRubricAdapter(unitOfWork, ids),
      oidcAuthorization: oidc,
      contactVerification,
      sessions: identity,
      solverActivation,
      workspaces: identity,
      authority: identity,
      challenges,
      publicChallenges,
      solverWorkspaces,
      eligibility: solverWorkspaces,
      teams,
      proposals,
      opportunities,
      notifications,
      decisionAudit,
      clock,
      ids,
    },
    async close() {
      if (ownsPool) await pool.end();
    },
  };
}
