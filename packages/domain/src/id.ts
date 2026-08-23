const identifierBrand: unique symbol = Symbol("rahhal.identifier");

export const idPrefixes = {
  tenant: "ten",
  user: "usr",
  workspace: "wsp",
  membership: "mem",
  session: "ses",
  challenge: "chl",
  challengeVersion: "chv",
  proposal: "prp",
  proposalVersion: "prv",
  reviewAssignment: "rva",
  rubric: "rub",
  rubricVersion: "rbv",
  case: "case",
  contract: "ctr",
  payment: "pay",
  file: "fil",
  outboxEvent: "evt",
  receipt: "rcp",
  auditEvent: "aud",
  correlation: "cor",
} as const;

export type IdPrefix = (typeof idPrefixes)[keyof typeof idPrefixes];

export type PrefixedId<Prefix extends IdPrefix> = `${Prefix}_${string}` & {
  readonly [identifierBrand]: Prefix;
};

export type TenantId = PrefixedId<"ten">;
export type UserId = PrefixedId<"usr">;
export type WorkspaceId = PrefixedId<"wsp">;
export type MembershipId = PrefixedId<"mem">;
export type SessionId = PrefixedId<"ses">;
export type ChallengeId = PrefixedId<"chl">;
export type ChallengeVersionId = PrefixedId<"chv">;
export type ProposalId = PrefixedId<"prp">;
export type ProposalVersionId = PrefixedId<"prv">;
export type ReviewAssignmentId = PrefixedId<"rva">;
export type RubricId = PrefixedId<"rub">;
export type RubricVersionId = PrefixedId<"rbv">;
export type CaseId = PrefixedId<"case">;
export type ContractId = PrefixedId<"ctr">;
export type PaymentId = PrefixedId<"pay">;
export type FileId = PrefixedId<"fil">;
export type OutboxEventId = PrefixedId<"evt">;
export type ReceiptId = PrefixedId<"rcp">;
export type AuditEventId = PrefixedId<"aud">;
export type CorrelationId = PrefixedId<"cor">;

export type EntityId =
  | TenantId
  | UserId
  | WorkspaceId
  | MembershipId
  | SessionId
  | ChallengeId
  | ChallengeVersionId
  | ProposalId
  | ProposalVersionId
  | ReviewAssignmentId
  | RubricId
  | RubricVersionId
  | CaseId
  | ContractId
  | PaymentId
  | FileId
  | OutboxEventId;

const entityIdPrefixes = [
  idPrefixes.tenant,
  idPrefixes.user,
  idPrefixes.workspace,
  idPrefixes.membership,
  idPrefixes.session,
  idPrefixes.challenge,
  idPrefixes.challengeVersion,
  idPrefixes.proposal,
  idPrefixes.proposalVersion,
  idPrefixes.reviewAssignment,
  idPrefixes.rubric,
  idPrefixes.rubricVersion,
  idPrefixes.case,
  idPrefixes.contract,
  idPrefixes.payment,
  idPrefixes.file,
  idPrefixes.outboxEvent,
] as const satisfies readonly IdPrefix[];

const identifierBodyPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{2,63}$/;

export class InvalidIdentifierError extends Error {
  readonly code = "INVALID_IDENTIFIER";

  constructor(
    readonly value: unknown,
    readonly expectedPrefix: IdPrefix,
  ) {
    super(`Expected an opaque identifier with prefix ${expectedPrefix}_`);
    this.name = "InvalidIdentifierError";
  }
}

export function isPrefixedId<Prefix extends IdPrefix>(
  value: unknown,
  prefix: Prefix,
): value is PrefixedId<Prefix> {
  if (typeof value !== "string" || !value.startsWith(`${prefix}_`)) {
    return false;
  }

  return identifierBodyPattern.test(value.slice(prefix.length + 1));
}

export function parsePrefixedId<Prefix extends IdPrefix>(
  value: unknown,
  prefix: Prefix,
): PrefixedId<Prefix> {
  if (!isPrefixedId(value, prefix)) {
    throw new InvalidIdentifierError(value, prefix);
  }

  return value;
}

function createIdentifierGuard<Prefix extends IdPrefix>(prefix: Prefix) {
  return (value: unknown): value is PrefixedId<Prefix> => isPrefixedId(value, prefix);
}

function createIdentifierParser<Prefix extends IdPrefix>(prefix: Prefix) {
  return (value: unknown): PrefixedId<Prefix> => parsePrefixedId(value, prefix);
}

export const isTenantId = createIdentifierGuard(idPrefixes.tenant);
export const isUserId = createIdentifierGuard(idPrefixes.user);
export const isWorkspaceId = createIdentifierGuard(idPrefixes.workspace);
export const isMembershipId = createIdentifierGuard(idPrefixes.membership);
export const isSessionId = createIdentifierGuard(idPrefixes.session);
export const isChallengeId = createIdentifierGuard(idPrefixes.challenge);
export const isChallengeVersionId = createIdentifierGuard(idPrefixes.challengeVersion);
export const isOutboxEventId = createIdentifierGuard(idPrefixes.outboxEvent);
export const isReceiptId = createIdentifierGuard(idPrefixes.receipt);
export const isAuditEventId = createIdentifierGuard(idPrefixes.auditEvent);
export const isCorrelationId = createIdentifierGuard(idPrefixes.correlation);

export function isEntityId(value: unknown): value is EntityId {
  return entityIdPrefixes.some((prefix) => isPrefixedId(value, prefix));
}

export const parseTenantId = createIdentifierParser(idPrefixes.tenant);
export const parseUserId = createIdentifierParser(idPrefixes.user);
export const parseWorkspaceId = createIdentifierParser(idPrefixes.workspace);
export const parseMembershipId = createIdentifierParser(idPrefixes.membership);
export const parseSessionId = createIdentifierParser(idPrefixes.session);
export const parseChallengeId = createIdentifierParser(idPrefixes.challenge);
export const parseChallengeVersionId = createIdentifierParser(idPrefixes.challengeVersion);
export const parseReceiptId = createIdentifierParser(idPrefixes.receipt);
export const parseAuditEventId = createIdentifierParser(idPrefixes.auditEvent);
export const parseCorrelationId = createIdentifierParser(idPrefixes.correlation);
