import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildChallengeContentResource } from "@rahhal/testkit";
import {
  parseCorrelationId,
  parseTenantId,
  parseUserId,
  parseWorkspaceId,
  parseMembershipId,
  type ChallengeSourcingModel,
} from "@rahhal/domain";
import { PostgresChallengeAdapter } from "../src/postgres/challenges.js";
import { PostgresProposalAdapter } from "../src/postgres/proposals.js";
import { PostgresOpportunityAdapter } from "../src/postgres/opportunities.js";
import { PostgresSolverWorkspaceAdapter } from "../src/postgres/solver-workspaces.js";
import { PostgresTeamAdapter } from "../src/postgres/teams.js";
import { PostgresUnitOfWork } from "../src/postgres/unit-of-work.js";
import { RandomIdFactory, systemClock } from "../src/primitives.js";
import { runMigrations } from "../src/postgres/migrations.js";
import { seedSyntheticData } from "../src/postgres/seeds.js";
import { testDatabaseAdminUrl } from "./support/database.js";

const name = `rahhal_participation_${process.pid}_${Date.now()}`;
const url = new URL(testDatabaseAdminUrl());
url.pathname = `/${name}`;
const admin = new Client({ connectionString: testDatabaseAdminUrl().toString() });
const database = new Pool({ connectionString: url.toString() });
const unit = new PostgresUnitOfWork(database);
const ids = new RandomIdFactory();
const challenges = new PostgresChallengeAdapter(unit, systemClock, ids);
const teams = new PostgresTeamAdapter(unit, systemClock, ids);
const proposals = new PostgresProposalAdapter(unit, teams, systemClock, ids);
const offers = new PostgresOpportunityAdapter(unit, teams, systemClock, ids);
const eligibility = new PostgresSolverWorkspaceAdapter(unit, systemClock, ids);
const command = () => ({
  idempotencyKey: ids.next("cor"),
  correlationId: parseCorrelationId(ids.next("cor")),
});
const owner = () => ({
  ...command(),
  actorUserId: parseUserId("usr_owner_alpha"),
  tenantId: parseTenantId("ten_org_alpha"),
  workspaceId: parseWorkspaceId("wsp_org_alpha"),
  role: "org:owner" as const,
});
const solver = (team = false) => ({
  ...command(),
  actorUserId: parseUserId("usr_solver_alpha"),
  tenantId: parseTenantId("ten_solver_alpha"),
  workspaceId: parseWorkspaceId(team ? "wsp_team_alpha" : "wsp_individual_alpha"),
  membershipId: parseMembershipId(team ? "mem_team_owner_alpha" : "mem_individual_alpha"),
  role: team ? ("team:owner" as const) : ("individual" as const),
});
const deadline = new Date(Date.now() + 86400_000 * 30).toISOString();
async function published(sourcing: ChallengeSourcingModel) {
  const created = await challenges.create(
    {
      expected_version: 0,
      draft: buildChallengeContentResource({
        visibility: "public",
        sourcing_model: sourcing,
        invitees: ["Planning text only"],
        allowed_applicant_types: ["individual", "expert-team"],
        applicant_scope: "both",
        verification_required: false,
        nda_required: false,
        document_gate_required: false,
        proposal_deadline: deadline,
      }),
    },
    owner(),
  );
  await challenges.publish(created.receipt.entity_id, { expected_version: 1 }, owner());
  const challenge = await challenges.getScoped(owner(), created.receipt.entity_id);
  if (!challenge?.published_version_id) throw new Error("Missing published challenge");
  return challenge;
}
const draft = {
  title: "Synthetic participation proposal",
  problem_statement: "A sufficiently detailed description of the current operational problem.",
  value_proposition: "A measurable and practical solution for this operational challenge.",
  technical_approach: "Collect baseline data and validate the solution in a controlled pilot.",
  success_metrics: "Ten percent measurable improvement",
  prototype_weeks: "6",
  duration_weeks: "12",
  budget_amount_minor: 100000,
  budget_currency: "IRR" as const,
  ip_status: "owned",
  conflict_declared: true,
  ip_accepted: true,
  accuracy_confirmed: true,
};

beforeAll(async () => {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${name}"`);
  await runMigrations(database, "up");
  await seedSyntheticData(database);
});
afterAll(async () => {
  await database.end();
  await admin.query(`DROP DATABASE IF EXISTS "${name}"`);
  await admin.end();
});

describe("published participation policy", () => {
  it.each([false, true])(
    "requires a real invitation for the exact active workspace (team=%s)",
    async (team) => {
      const challenge = await published("private");
      const context = solver(team);
      const created = await proposals.create(
        { expected_version: 0, challenge_id: challenge.id, draft },
        context,
      );
      const submit = () =>
        proposals.submit(
          created.receipt.entity_id,
          { expected_version: 1, accepted_challenge_version_id: challenge.published_version_id! },
          solver(team),
        );
      expect(await eligibility.evaluate(context, challenge.id)).toMatchObject({
        status: "ineligible",
        reasons: [{ code: "invitation_required" }],
      });
      await expect(submit()).rejects.toMatchObject({
        code: "INVALID_STATE",
        options: { eligibility: { reasons: [{ code: "invitation_required" }] } },
      });
      const offer = await offers.send(
        {
          expected_version: 0,
          challenge_id: challenge.id,
          challenge_version_id: challenge.published_version_id!,
          recipient_workspace_id: context.workspaceId,
          title: "Synthetic invitation",
          summary: "Invitation to participate in the synthetic private challenge",
          invitation_reasons: ["Relevant experience"],
          requested_documents: [],
          response_deadline: deadline,
        },
        owner(),
      );
      expect(await eligibility.evaluate(context, challenge.id)).toMatchObject({
        status: "eligible",
      });
      expect(await eligibility.evaluate(solver(!team), challenge.id)).toMatchObject({
        status: "ineligible",
        reasons: [{ code: "invitation_required" }],
      });
      await offers.cancel(
        offer.receipt.entity_id,
        { expected_version: 1, reason: "Synthetic cancellation" },
        owner(),
      );
      await expect(submit()).rejects.toMatchObject({ code: "INVALID_STATE" });
      await offers.send(
        {
          expected_version: 0,
          challenge_id: challenge.id,
          challenge_version_id: challenge.published_version_id!,
          recipient_workspace_id: context.workspaceId,
          title: "Replacement invitation",
          summary: "A fresh active invitation after the previous cancellation",
          invitation_reasons: ["Relevant experience"],
          requested_documents: [],
          response_deadline: deadline,
        },
        owner(),
      );
      await expect(submit()).resolves.toHaveProperty("entityVersion", 2);
    },
  );
  it.each(["public", "hybrid"] as const)(
    "does not require invitation for %s sourcing",
    async (sourcing) => {
      const challenge = await published(sourcing);
      const created = await proposals.create(
        { expected_version: 0, challenge_id: challenge.id, draft },
        solver(),
      );
      await expect(
        proposals.submit(
          created.receipt.entity_id,
          { expected_version: 1, accepted_challenge_version_id: challenge.published_version_id! },
          solver(),
        ),
      ).resolves.toHaveProperty("entityVersion", 2);
    },
  );
});
