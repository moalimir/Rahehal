import { Pool } from "pg";

import { ApiProblem } from "./errors.js";
import { RandomIdFactory, systemClock } from "./primitives.js";
import type {
  ApiPorts,
  Clock,
  IdFactory,
  OidcExchangePort,
  SessionCredentialIssuerPort,
} from "./ports.js";
import { PostgresAccessDecisionAudit } from "./postgres/access-decision-audit.js";
import { PostgresChallengeAdapter } from "./postgres/challenges.js";
import { databasePoolConfig } from "./postgres/config.js";
import { PostgresIdentityWorkspaceAdapter } from "./postgres/identity-workspace.js";
import { PostgresUnitOfWork } from "./postgres/unit-of-work.js";

const requiredMigration = "0003_a1c_authoritative_challenge";

class DeferredOidcExchange implements OidcExchangePort {
  async exchange(): Promise<never> {
    throw new ApiProblem(503, "STORAGE", "Managed OIDC exchange is not available before A2");
  }
}

class DeferredCredentialIssuer implements SessionCredentialIssuerPort {
  issue(): never {
    throw new ApiProblem(503, "STORAGE", "Session credential issuance is not available before A2");
  }
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
    readonly oidc?: OidcExchangePort;
    readonly credentials?: SessionCredentialIssuerPort;
    readonly beforeCommit?: () => void | Promise<void>;
  } = {},
): Promise<PostgresApiComposition> {
  const ownsPool = options.pool === undefined;
  const environment = options.environment ?? process.env;
  if (environment.NODE_ENV === "production") {
    throw new Error(
      "The A1c PostgreSQL composition is local-integration-only until A2 provides managed identity",
    );
  }
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

  const clock = options.clock ?? systemClock;
  const ids = options.ids ?? new RandomIdFactory();
  const unitOfWork = new PostgresUnitOfWork(pool, options.beforeCommit);
  const decisionAudit = new PostgresAccessDecisionAudit(unitOfWork, ids);
  const identity = new PostgresIdentityWorkspaceAdapter(
    unitOfWork,
    options.oidc ?? new DeferredOidcExchange(),
    options.credentials ?? new DeferredCredentialIssuer(),
    clock,
    ids,
    decisionAudit,
  );
  const challenges = new PostgresChallengeAdapter(unitOfWork, clock, ids);

  return {
    pool,
    unitOfWork,
    ports: {
      sessions: identity,
      workspaces: identity,
      authority: identity,
      challenges,
      decisionAudit,
      clock,
      ids,
    },
    async close() {
      if (ownsPool) await pool.end();
    },
  };
}
