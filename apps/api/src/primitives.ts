import { createHash, randomUUID } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { parseCorrelationId } from "@rahhal/domain";
import { ApiProblem, unauthorized } from "./errors.js";
import type {
  AccessDecisionAuditPort,
  AuthenticatedSession,
  Clock,
  IdFactory,
  SessionPort,
} from "./ports.js";

export const systemClock: Clock = { now: () => new Date() };

export class MonotonicIdFactory implements IdFactory {
  private sequence = 0;

  next(prefix: Parameters<IdFactory["next"]>[0]) {
    this.sequence += 1;
    return `${prefix}_${this.sequence.toString(36).padStart(8, "0")}`;
  }
}

export class RandomIdFactory implements IdFactory {
  next(prefix: Parameters<IdFactory["next"]>[0]) {
    return `${prefix}_${randomUUID().replaceAll("-", "")}`;
  }
}

function normalized(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalized);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right, "en"))
        .map(([key, item]) => [key, normalized(item)]),
    );
  }
  return value;
}

export function commandFingerprint(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(normalized(value)))
    .digest("hex");
}

export function correlationId(request: FastifyRequest) {
  return parseCorrelationId(`cor_${request.id.replace(/[^A-Za-z0-9_-]/g, "")}`);
}

export function requiredHeader(request: FastifyRequest, name: string) {
  const value = request.headers[name.toLowerCase()];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ApiProblem(422, "VALIDATION", `${name} header is required`, {
      fields: [{ path: name, code: "required", message: `${name} header is required` }],
    });
  }
  return value.trim();
}

export async function requireSession(
  request: FastifyRequest,
  sessions: SessionPort,
  decisionAudit: AccessDecisionAuditPort,
  clock: Clock,
): Promise<AuthenticatedSession> {
  return (await authenticateRequest(request, sessions, decisionAudit, clock)).session;
}

export async function authenticateRequest(
  request: FastifyRequest,
  sessions: SessionPort,
  decisionAudit: AccessDecisionAuditPort,
  clock: Clock,
): Promise<{ readonly session: AuthenticatedSession; readonly accessToken: string }> {
  const auditBase = {
    action: "session:authenticate",
    entityType: "session",
    correlationId: correlationId(request),
    occurredAt: clock.now().toISOString(),
  } as const;

  let accessToken: string;
  try {
    accessToken = bearerToken(request);
  } catch {
    await decisionAudit.record({
      ...auditBase,
      outcome: "denied",
      reason: "bearer_missing_or_malformed",
    });
    throw unauthorized();
  }

  const session = await sessions.authenticate(accessToken);
  if (!session) {
    await decisionAudit.record({
      ...auditBase,
      outcome: "denied",
      reason: "session_unavailable",
    });
    throw unauthorized();
  }
  await decisionAudit.record({
    ...auditBase,
    outcome: "success",
    actorUserId: session.userId,
    entityId: session.id,
  });
  return { session, accessToken };
}

export function bearerToken(request: FastifyRequest) {
  const authorization = request.headers.authorization;
  const match = typeof authorization === "string" ? /^Bearer ([^\s]+)$/.exec(authorization) : null;
  if (!match) throw unauthorized();
  return match[1];
}
