import type {
  BrowserDecisionStepUpStartBody,
  OidcAuthorizationStartResult,
  SessionExchangeBody,
} from "@rahhal/contracts";
import { parseSessionId } from "@rahhal/domain";

import { ApiProblem, forbidden, notFound, staleVersion } from "../errors.js";
import type {
  AuthenticatedSession,
  IdFactory,
  OidcAuthorizationPort,
  OidcExchangePort,
} from "../ports.js";
import { commandFingerprint } from "../primitives.js";
import type {
  CompletedStepUp,
  StepUpCommandContext,
  StepUpCredentialIssuerPort,
  StepUpPort,
} from "../step-up-port.js";
import type { PostgresUnitOfWork } from "./unit-of-work.js";

const verifiedLifetimeMs = 5 * 60_000;
const clockSkewMs = 2 * 60_000;

type ChallengeRow = { readonly id: string; readonly stage: string; readonly lock_version: string };
type StepUpRow = {
  readonly id: string;
  readonly session_id: string;
  readonly session_version: string;
  readonly user_id: string;
  readonly tenant_id: string;
  readonly workspace_id: string;
  readonly action: string;
  readonly target_id: string;
  readonly return_to: string;
  readonly status: "pending" | "verified" | "consumed";
  readonly proof_digest: string | null;
  readonly created_at: Date;
  readonly expires_at: Date;
};

function persistedVersion(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error("Invalid persisted version");
  return parsed;
}

function authorize(context: StepUpCommandContext): void {
  if (context.role !== "org:owner" && context.role !== "org:member") throw forbidden();
}

export class PostgresStepUpAdapter implements StepUpPort {
  constructor(
    private readonly unitOfWork: PostgresUnitOfWork,
    private readonly oidc: OidcAuthorizationPort & OidcExchangePort,
    private readonly credentials: StepUpCredentialIssuerPort,
    private readonly ids: IdFactory,
  ) {}

  async start(
    challengeId: string,
    body: BrowserDecisionStepUpStartBody,
    redirectUri: string,
    context: StepUpCommandContext,
  ): Promise<OidcAuthorizationStartResult> {
    authorize(context);
    return this.unitOfWork.run(async () => {
      const client = this.unitOfWork.currentClient();
      const challengeResult = await client.query<ChallengeRow>(
        `SELECT id, stage, lock_version FROM challenge
         WHERE id = $1 AND tenant_id = $2 AND workspace_id = $3 FOR SHARE`,
        [challengeId, context.tenantId, context.workspaceId],
      );
      const challenge = challengeResult.rows[0];
      if (!challenge) throw notFound();
      const currentVersion = persistedVersion(challenge.lock_version);
      if (body.expected_version !== currentVersion) throw staleVersion(currentVersion);
      if (challenge.stage !== "evaluating") {
        throw new ApiProblem(409, "INVALID_STATE", "Only an evaluating challenge can be decided", {
          currentState: challenge.stage,
        });
      }
      const result = await this.oidc.start(
        { expected_version: 0, redirect_uri: redirectUri },
        {
          idempotencyKey: commandFingerprint({
            idempotencyKey: context.idempotencyKey,
            sessionId: context.sessionId,
            sessionVersion: context.sessionVersion,
            actorUserId: context.actorUserId,
            tenantId: context.tenantId,
            workspaceId: context.workspaceId,
            challengeId,
          }),
          correlationId: context.correlationId,
        },
        { forceReauthentication: true },
      );
      const now = (await client.query<{ now: Date }>("SELECT transaction_timestamp() AS now"))
        .rows[0]!.now;
      const returnTo = `/app/org/challenges/record/evaluation?id=${challenge.id}`;
      await client.query(
        `INSERT INTO step_up_attempt (
           id, oidc_state_digest, session_id, session_version, user_id, tenant_id,
           workspace_id, action, target_type, target_id, return_to, created_at, expires_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,'challenge.decision.record','challenge',$8,$9,$10,$11)
         ON CONFLICT (oidc_state_digest) DO NOTHING`,
        [
          this.ids.next("sup"),
          commandFingerprint(result.state),
          context.sessionId,
          context.sessionVersion,
          context.actorUserId,
          context.tenantId,
          context.workspaceId,
          challenge.id,
          returnTo,
          now,
          result.expires_at,
        ],
      );
      const persisted = await client.query<StepUpRow>(
        `SELECT id, session_id, session_version, user_id, tenant_id, workspace_id, action,
                target_id, return_to, status, proof_digest, created_at, expires_at
         FROM step_up_attempt WHERE oidc_state_digest = $1 FOR SHARE`,
        [commandFingerprint(result.state)],
      );
      const row = persisted.rows[0];
      if (
        !row ||
        row.session_id !== context.sessionId ||
        persistedVersion(row.session_version) !== context.sessionVersion ||
        row.user_id !== context.actorUserId ||
        row.tenant_id !== context.tenantId ||
        row.workspace_id !== context.workspaceId ||
        row.action !== "challenge.decision.record" ||
        row.target_id !== challenge.id ||
        row.return_to !== returnTo ||
        row.status !== "pending" ||
        row.proof_digest !== null ||
        row.expires_at.getTime() <= now.getTime()
      ) {
        throw new Error("Persisted step-up attempt does not match its command context");
      }
      return result;
    });
  }

  async complete(
    body: SessionExchangeBody,
    session: AuthenticatedSession,
  ): Promise<CompletedStepUp> {
    return this.unitOfWork.run(async () => {
      const client = this.unitOfWork.currentClient();
      const result = await client.query<StepUpRow>(
        `SELECT id, session_id, session_version, user_id, tenant_id, workspace_id, action,
                target_id, return_to, status, proof_digest, created_at, expires_at
         FROM step_up_attempt WHERE oidc_state_digest = $1 FOR UPDATE`,
        [commandFingerprint(body.state)],
      );
      const attempt = result.rows[0];
      const now = (await client.query<{ now: Date }>("SELECT transaction_timestamp() AS now"))
        .rows[0]!.now;
      if (
        !attempt ||
        attempt.status !== "pending" ||
        attempt.session_id !== session.id ||
        persistedVersion(attempt.session_version) !== session.version ||
        attempt.user_id !== session.userId ||
        attempt.expires_at.getTime() <= now.getTime()
      ) {
        throw forbidden("step_up_attempt_unavailable");
      }
      const identity = await this.oidc.exchange(body, { maxAgeSeconds: 0 });
      if (!identity?.authenticatedAt) throw forbidden("step_up_fresh_authentication_missing");
      const authenticatedAt = new Date(identity.authenticatedAt);
      if (
        !Number.isFinite(authenticatedAt.getTime()) ||
        authenticatedAt.getTime() < attempt.created_at.getTime() - clockSkewMs ||
        authenticatedAt.getTime() > now.getTime() + clockSkewMs
      ) {
        throw forbidden("step_up_authentication_not_fresh");
      }
      const linked = await client.query<{ user_id: string }>(
        `SELECT link.user_id FROM identity_link link
         JOIN app_user user_row ON user_row.id = link.user_id
         WHERE link.issuer = $1 AND link.subject = $2
           AND user_row.primary_email = $3 AND user_row.email_verified = true`,
        [identity.issuer, identity.subject, identity.verifiedEmail],
      );
      if (linked.rows[0]?.user_id !== session.userId) {
        throw forbidden("step_up_identity_mismatch");
      }
      const token = this.credentials.issue(
        attempt.id,
        parseSessionId(attempt.session_id),
        session.version,
      );
      const expiresAt = new Date(
        Math.min(attempt.expires_at.getTime(), now.getTime() + verifiedLifetimeMs),
      );
      const updated = await client.query(
        `UPDATE step_up_attempt
         SET status = 'verified', proof_digest = $2, provider_issuer = $3,
             provider_subject = $4, authenticated_at = $5, verified_at = $6, expires_at = $7
         WHERE id = $1 AND status = 'pending'`,
        [
          attempt.id,
          commandFingerprint(token),
          identity.issuer,
          identity.subject,
          authenticatedAt,
          now,
          expiresAt,
        ],
      );
      if (updated.rowCount !== 1) throw forbidden("step_up_attempt_unavailable");
      await this.oidc.consume(identity);
      return { token, expiresAt: expiresAt.toISOString(), returnTo: attempt.return_to };
    });
  }
}
