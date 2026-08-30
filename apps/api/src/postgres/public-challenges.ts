import type {
  ChallengePublicPage,
  ChallengePublicProjectionResource,
  PublicAudience,
  PublicChallengeQuery,
} from "@rahhal/contracts";
import {
  applicantScopes,
  challengeIpTerms,
  challengeOutputTypes,
  challengePublicationStates,
  challengeSourcingModels,
  challengeWorkModes,
  currencies,
  isApplicantType,
  parseChallengeId,
  parseChallengeVersionId,
  type ApplicantScope,
  type ChallengeIpTerms,
  type ChallengeOutputType,
  type ChallengeSourcingModel,
  type ChallengeWorkMode,
  type Currency,
} from "@rahhal/domain";

import {
  encodePublicChallengeCursor,
  decodePublicChallengeCursor,
  publicChallengePageSize,
  visibleVisibilities,
} from "../public-catalogue.js";
import type { PublicChallengePort } from "../ports.js";
import { PostgresUnitOfWork } from "./unit-of-work.js";

type ProjectionRow = {
  readonly challenge_id: string;
  readonly challenge_version_id: string;
  readonly title: string;
  readonly category: string;
  readonly location: string;
  readonly public_summary: string;
  readonly output_type: string;
  readonly sourcing_model: string;
  readonly applicant_scope: string;
  readonly allowed_applicant_types: readonly string[];
  readonly work_mode: string;
  readonly proposal_deadline: Date;
  readonly preferred_start_date: Date | null;
  readonly budget_status: string;
  readonly budget_amount_minor: string | null;
  readonly budget_currency: string;
  readonly visibility: string;
  readonly verification_required: boolean;
  readonly nda_required: boolean;
  readonly document_gate_required: boolean;
  readonly ip_terms: string;
  readonly state: string;
  readonly published_at: Date;
};

/**
 * The exact column list every public query selects. Written once, as a
 * literal: a `SELECT *` here would publish any column a later migration adds
 * to the projection table before anyone reviewed it as public.
 */
const projectionColumns = `
  challenge_id, challenge_version_id, title, category, location, public_summary,
  output_type, sourcing_model, applicant_scope, allowed_applicant_types, work_mode,
  proposal_deadline, preferred_start_date, budget_status, budget_amount_minor,
  budget_currency, visibility, verification_required, nda_required,
  document_gate_required, ip_terms, state, published_at
`;

function oneOf<Value extends string>(
  allowed: readonly Value[],
  value: string,
  field: string,
): Value {
  if (!(allowed as readonly string[]).includes(value)) {
    throw new Error(`Public projection returned an invalid ${field}`);
  }
  return value as Value;
}

function budgetAmountMinor(value: string | null): number | null {
  if (value === null) return null;
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new Error("Public projection returned an invalid budget amount");
  }
  return amount;
}

function projectionResource(row: ProjectionRow): ChallengePublicProjectionResource {
  if (!row.allowed_applicant_types.every(isApplicantType)) {
    throw new Error("Public projection returned an invalid applicant type");
  }
  if (row.visibility !== "public" && row.visibility !== "registered") {
    throw new Error("Public projection returned a non-listable visibility");
  }
  return {
    challenge_id: parseChallengeId(row.challenge_id),
    challenge_version_id: parseChallengeVersionId(row.challenge_version_id),
    title: row.title,
    category: row.category,
    location: row.location,
    public_summary: row.public_summary,
    output_type: oneOf<ChallengeOutputType>(challengeOutputTypes, row.output_type, "output type"),
    sourcing_model: oneOf<ChallengeSourcingModel>(
      challengeSourcingModels,
      row.sourcing_model,
      "sourcing model",
    ),
    applicant_scope: oneOf<ApplicantScope>(applicantScopes, row.applicant_scope, "applicant scope"),
    allowed_applicant_types: [...row.allowed_applicant_types],
    work_mode: oneOf<ChallengeWorkMode>(challengeWorkModes, row.work_mode, "work mode"),
    proposal_deadline: row.proposal_deadline.toISOString(),
    preferred_start_date: row.preferred_start_date?.toISOString() ?? null,
    budget: {
      status: oneOf(
        ["fixed", "quote", "undecided", "non_cash"] as const,
        row.budget_status,
        "budget status",
      ),
      amount_minor: budgetAmountMinor(row.budget_amount_minor),
      currency: oneOf<Currency>(currencies, row.budget_currency, "currency"),
    },
    visibility: row.visibility,
    verification_required: row.verification_required,
    nda_required: row.nda_required,
    document_gate_required: row.document_gate_required,
    ip_terms: oneOf<ChallengeIpTerms>(challengeIpTerms, row.ip_terms, "IP terms"),
    // A paused or closed call still resolves by direct link -- solvers who
    // already have it must be able to see that it stopped accepting proposals.
    // Only the *listing* filters on state.
    state: oneOf(challengePublicationStates, row.state, "publication state"),
    published_at: row.published_at.toISOString(),
  };
}

/**
 * B5's public read path. Every statement in this adapter reads
 * `challenge_public_projection` and nothing else — it never joins `challenge`,
 * `challenge_version`, or `challenge_approval`, so no unauthenticated request
 * can reach the private aggregate even through a mistaken join.
 */
export class PostgresPublicChallengeAdapter implements PublicChallengePort {
  constructor(private readonly unitOfWork: PostgresUnitOfWork) {}

  async list(audience: PublicAudience, query: PublicChallengeQuery): Promise<ChallengePublicPage> {
    const cursor = decodePublicChallengeCursor(query.cursor);
    return this.unitOfWork.run(async () => {
      const result = await this.unitOfWork.currentClient().query<ProjectionRow>(
        `
          SELECT ${projectionColumns}
          FROM challenge_public_projection
          WHERE state = 'open'
            AND visibility = ANY ($1::text[])
            AND ($2::text IS NULL OR category = $2)
            AND (
              $3::timestamptz IS NULL
              OR (proposal_deadline, challenge_id) < ($3::timestamptz, $4::text)
            )
          ORDER BY proposal_deadline DESC, challenge_id DESC
          LIMIT $5
        `,
        [
          [...visibleVisibilities(audience)],
          query.category ?? null,
          cursor?.proposal_deadline ?? null,
          cursor?.challenge_id ?? null,
          publicChallengePageSize + 1,
        ],
      );
      // One row beyond the page size answers "is there more?" without a count.
      const items = result.rows.slice(0, publicChallengePageSize).map(projectionResource);
      const last = items.at(-1);
      return {
        items,
        next_cursor:
          result.rows.length > publicChallengePageSize && last
            ? encodePublicChallengeCursor(last)
            : null,
      };
    });
  }

  async get(
    audience: PublicAudience,
    id: string,
  ): Promise<ChallengePublicProjectionResource | null> {
    return this.unitOfWork.run(async () => {
      const result = await this.unitOfWork.currentClient().query<ProjectionRow>(
        `
          SELECT ${projectionColumns}
          FROM challenge_public_projection
          WHERE challenge_id = $1 AND visibility = ANY ($2::text[])
        `,
        [id, [...visibleVisibilities(audience)]],
      );
      const row = result.rows[0];
      return row ? projectionResource(row) : null;
    });
  }
}
