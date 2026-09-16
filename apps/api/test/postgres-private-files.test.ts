import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildChallengeContentResource } from "@rahhal/testkit";
import {
  parseCorrelationId,
  parseMembershipId,
  parseTenantId,
  parseUserId,
  parseWorkspaceId,
  parsePrefixedId,
} from "@rahhal/domain";
import { privatePdfMaxBytes, type FileTarget } from "@rahhal/contracts";
import { PostgresChallengeAdapter } from "../src/postgres/challenges.js";
import { PostgresProposalAdapter } from "../src/postgres/proposals.js";
import { PostgresTeamAdapter } from "../src/postgres/teams.js";
import { PostgresOpportunityAdapter } from "../src/postgres/opportunities.js";
import { PostgresPrivateFileAdapter } from "../src/postgres/private-files.js";
import { PrivatePdfStorage, type PdfScanResult } from "../src/private-pdf-storage.js";
import { PostgresUnitOfWork } from "../src/postgres/unit-of-work.js";
import { RandomIdFactory, systemClock } from "../src/primitives.js";
import { runMigrations } from "../src/postgres/migrations.js";
import { seedSyntheticData } from "../src/postgres/seeds.js";
import { testDatabaseAdminUrl } from "./support/database.js";
import { createPostgresApiComposition } from "../src/postgres-composition.js";
import { buildApi } from "../src/app.js";

const name = `rahhal_files_${process.pid}_${Date.now()}`;
const url = new URL(testDatabaseAdminUrl());
url.pathname = `/${name}`;
const admin = new Client({ connectionString: testDatabaseAdminUrl().toString() });
const database = new Pool({ connectionString: url.toString() });
const unit = new PostgresUnitOfWork(database);
const ids = new RandomIdFactory();
const challenges = new PostgresChallengeAdapter(unit, systemClock, ids);
const teams = new PostgresTeamAdapter(unit, systemClock, ids);
const proposals = new PostgresProposalAdapter(unit, teams, systemClock, ids);
const context = (org = false) => ({
  actorUserId: parseUserId(org ? "usr_owner_alpha" : "usr_solver_alpha"),
  tenantId: parseTenantId(org ? "ten_org_alpha" : "ten_solver_alpha"),
  workspaceId: parseWorkspaceId(org ? "wsp_org_alpha" : "wsp_individual_alpha"),
  membershipId: parseMembershipId(org ? "mem_owner_alpha" : "mem_individual_alpha"),
  role: org ? ("org:owner" as const) : ("individual" as const),
  idempotencyKey: ids.next("cor"),
  correlationId: parseCorrelationId(ids.next("cor")),
});
let directory: string;
let files: PostgresPrivateFileAdapter;
let verdict: PdfScanResult = "clean";
const bytes = Buffer.from("%PDF-1.7\nsynthetic scanner-port fixture; not a rendered PDF\n%%EOF");
let challengeId: ReturnType<typeof parsePrefixedId<"chl">>;
let publishedVersion: ReturnType<typeof parsePrefixedId<"chv">>;
let proposalId: ReturnType<typeof parsePrefixedId<"prp">>;
const target = (): FileTarget => ({ entity_type: "proposal", entity_id: proposalId });
const uploadBody = (to: FileTarget = target()) => ({
  ...to,
  expected_version: 1,
  filename: "synthetic.pdf",
  mime: "application/pdf" as const,
  classification: "confidential" as const,
  size: bytes.length,
});
async function uploaded(to: FileTarget = target(), org = false) {
  const request = await files.request(uploadBody(to), context(org));
  const token = new URL(request.upload_url, "http://local").searchParams.get("token")!;
  const upload = await files.upload(request.file.id, token, bytes, context(org));
  await files.complete(upload.file.id, upload.file.version, context(org));
  return request.file.id;
}
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "rahhal-pdf-tests-"));
  files = new PostgresPrivateFileAdapter(
    unit,
    ids,
    challenges,
    proposals,
    new PrivatePdfStorage(directory, "synthetic-file-signing-secret-at-least-32-characters", {
      scan: async () => verdict,
    }),
  );
  await admin.connect();
  await admin.query(`CREATE DATABASE "${name}"`);
  await runMigrations(database, "up");
  await seedSyntheticData(database);
  const created = await challenges.create(
    {
      expected_version: 0,
      draft: buildChallengeContentResource({
        visibility: "public",
        sourcing_model: "public",
        allowed_applicant_types: ["individual", "expert-team"],
        applicant_scope: "both",
        verification_required: false,
        nda_required: false,
        document_gate_required: false,
        proposal_deadline: new Date(Date.now() + 86400_000 * 30).toISOString(),
      }),
    },
    context(true),
  );
  challengeId = created.receipt.entity_id;
  // Challenge upload/binding precedes publication.
  const file = await uploaded({ entity_type: "challenge", entity_id: challengeId }, true);
  await files.scanNext();
  await challenges.patch(
    challengeId,
    { expected_version: 1, patch: { attachment_ids: [file] } },
    context(true),
  );
  await challenges.publish(challengeId, { expected_version: 2 }, context(true));
  publishedVersion = (await challenges.getScoped(context(true), challengeId))!
    .published_version_id!;
  const proposal = await proposals.create(
    {
      expected_version: 0,
      challenge_id: challengeId,
      draft: {
        title: "Synthetic PDF proposal",
        problem_statement: "The existing process needs measurable and reliable improvements.",
        value_proposition: "A practical solution that improves operational efficiency measurably.",
        technical_approach:
          "Collect a baseline and run a controlled pilot with repeatable measurements.",
        success_metrics: "Ten percent improvement",
        prototype_weeks: "4",
        duration_weeks: "8",
        budget_amount_minor: 10000,
        budget_currency: "IRR",
        ip_status: "owned",
        conflict_declared: true,
        ip_accepted: true,
        accuracy_confirmed: true,
      },
    },
    context(),
  );
  proposalId = proposal.receipt.entity_id;
});
afterAll(async () => {
  await database.end();
  await admin.query(`DROP DATABASE IF EXISTS "${name}"`);
  await admin.end();
  if (directory) await rm(directory, { recursive: true, force: true });
});

describe("private PDF authority", () => {
  it("shares published challenge PDFs with an invited workspace only while its grant remains active", async () => {
    const team = {
      ...context(),
      workspaceId: parseWorkspaceId("wsp_team_alpha"),
      membershipId: parseMembershipId("mem_team_owner_alpha"),
      role: "team:owner" as const,
    };
    const challengeTarget = { entity_type: "challenge" as const, entity_id: challengeId };
    expect(await files.list(challengeTarget, team)).toEqual([]);
    const offers = new PostgresOpportunityAdapter(unit, teams, systemClock, ids);
    const offer = await offers.send(
      {
        expected_version: 0,
        challenge_id: challengeId,
        challenge_version_id: publishedVersion,
        recipient_workspace_id: team.workspaceId,
        title: "PDF inspection invitation",
        summary: "Synthetic invitation to inspect permitted challenge PDFs",
        invitation_reasons: ["Synthetic inspection"],
        requested_documents: [],
        response_deadline: new Date(Date.now() + 86_400_000).toISOString(),
      },
      context(true),
    );
    const shared = await files.list(challengeTarget, team);
    expect(shared).toHaveLength(1);
    const link = await files.downloadUrl(shared[0]!.id, team);
    const token = new URL(link.download_url, "http://local").searchParams.get("token")!;
    expect((await files.download(shared[0]!.id, token, team)).content).toEqual(bytes);
    expect(await files.list(challengeTarget, context())).toEqual([]);
    await offers.cancel(
      offer.receipt.entity_id,
      { expected_version: 1, reason: "Synthetic invitation revocation" },
      context(true),
    );
    expect(await files.list(challengeTarget, team)).toEqual([]);
    await expect(files.download(shared[0]!.id, token, team)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
  it("rechecks actual API session and membership on signed reads and audits denials", async () => {
    const runtime = await createPostgresApiComposition({
      pool: database,
      environment: {
        NODE_ENV: "test",
        OIDC_ISSUER_URL: "http://dex.localhost:5556/dex",
        OIDC_CLIENT_ID: "rahhal-local-web",
        OIDC_ALLOWED_REDIRECT_URIS: "http://localhost:3000/auth/callback",
        OIDC_ALLOW_INSECURE_HTTP: "true",
        OIDC_FLOW_SECRET: "synthetic-file-test-oidc-secret-00000001",
        SESSION_CREDENTIAL_SECRET: "synthetic-file-test-session-secret-00000001",
        SOLVER_CONTACT_VERIFICATION_PROVIDER: "development",
        SOLVER_OTP_DEVELOPMENT_CODE: "12345",
        SOLVER_OTP_FLOW_SECRET: "synthetic-file-test-otp-secret-00000001",
      },
    });
    const service = new PostgresPrivateFileAdapter(
      runtime.unitOfWork,
      ids,
      runtime.ports.challenges,
      runtime.ports.proposals,
      new PrivatePdfStorage(directory, "synthetic-file-signing-secret-at-least-32-characters", {
        scan: async () => "clean",
      }),
    );
    const app = buildApi({ ...runtime.ports, privateFiles: service });
    const headers = {
      authorization: "Bearer local-a1b-access-owner-alpha",
      "x-workspace-id": "wsp_org_alpha",
    };
    try {
      const editable = await runtime.ports.challenges.create(
        { expected_version: 0, draft: buildChallengeContentResource() },
        context(true),
      );
      const uploadHeaders = { ...headers, "idempotency-key": "http-pdf-reservation" };
      const reservation = await app.inject({
        method: "POST",
        url: "/api/v1/files:request-upload",
        headers: uploadHeaders,
        payload: uploadBody({ entity_type: "challenge", entity_id: editable.receipt.entity_id }),
      });
      expect(reservation.statusCode, reservation.body).toBe(200);
      expect(reservation.json().meta.entity_version).toBe(1);
      expect(reservation.json().data.file).not.toHaveProperty("object_key");
      const uploaded = await app.inject({
        method: "PUT",
        url: reservation.json().data.upload_url,
        headers: {
          ...headers,
          "idempotency-key": "http-pdf-bytes",
          "content-type": "application/pdf",
        },
        payload: bytes,
      });
      expect(uploaded.statusCode, uploaded.body).toBe(200);
      expect(uploaded.json().data.file.state).toBe("quarantined");
      expect(uploaded.json().meta.entity_version).toBe(2);
      const completed = await app.inject({
        method: "POST",
        url: `/api/v1/files/${uploaded.json().data.file.id}:complete`,
        headers: { ...headers, "idempotency-key": "http-pdf-complete" },
        payload: { expected_version: 2 },
      });
      expect(completed.statusCode, completed.body).toBe(200);
      expect(completed.json().data.file.state).toBe("pending_scan");
      await service.scanNext();
      const list = await app.inject({
        method: "GET",
        url: `/api/v1/files?entity_type=challenge&entity_id=${challengeId}`,
        headers,
      });
      expect(list.statusCode, list.body).toBe(200);
      const fileId = list.json<{ data: Array<{ id: string }> }>().data[0]!.id;
      const grant = await app.inject({
        method: "GET",
        url: `/api/v1/files/${fileId}:download-url`,
        headers,
      });
      expect(grant.statusCode, grant.body).toBe(200);
      const download = grant.json<{ data: { download_url: string } }>().data.download_url;
      const received = await app.inject({ method: "GET", url: download, headers });
      expect(received.statusCode, received.body).toBe(200);
      expect(received.rawPayload).toEqual(bytes);
      expect(received.headers["cache-control"]).toBe("no-store");
      expect(received.headers["content-disposition"]).toContain("attachment");
      expect((await app.inject({ method: "GET", url: download })).statusCode).toBe(403);
      expect(
        (
          await app.inject({
            method: "GET",
            url: download,
            headers: { ...headers, "x-workspace-id": "wsp_org_beta" },
          })
        ).statusCode,
      ).toBe(404);
      await database.query("UPDATE membership SET state='suspended' WHERE id='mem_owner_alpha'");
      expect((await app.inject({ method: "GET", url: download, headers })).statusCode).toBe(404);
      await database.query("UPDATE membership SET state='active' WHERE id='mem_owner_alpha'");
      const altered = download.replace(/token=\d+\./, "token=1.");
      expect((await app.inject({ method: "GET", url: altered, headers })).statusCode).toBe(404);
      expect(
        (
          await database.query(
            "SELECT 1 FROM audit_event WHERE action='file:download' AND outcome='denied' AND target_id=$1",
            [fileId],
          )
        ).rowCount,
      ).toBeGreaterThan(0);
      const tooLarge = await app.inject({
        method: "PUT",
        url: `/api/v1/files/${fileId}/upload?token=invalid`,
        headers: {
          ...headers,
          "content-type": "application/pdf",
          "idempotency-key": "oversized-file-api-test",
        },
        payload: Buffer.alloc(privatePdfMaxBytes + 1),
      });
      expect(tooLarge.statusCode).toBe(422);
    } finally {
      await database.query("UPDATE membership SET state='active' WHERE id='mem_owner_alpha'");
      await app.close();
      await runtime.close();
    }
  });
  it("denies invalid declarations, bytes, wrong owner and unscanned download/binding", async () => {
    await expect(
      files.request({ ...uploadBody(), size: privatePdfMaxBytes + 1 }, context()),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      files.request({ ...uploadBody(), filename: "../document.pdf" }, context()),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(files.request(uploadBody(), context(true))).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    const request = await files.request(uploadBody(), context());
    const token = new URL(request.upload_url, "http://local").searchParams.get("token")!;
    await expect(
      files.upload(request.file.id, token, Buffer.alloc(bytes.length), context()),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(files.upload(request.file.id, token, bytes, context(true))).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(files.downloadUrl(request.file.id, context())).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      proposals.patch(
        proposalId,
        { expected_version: 1, patch: { attachment_ids: [request.file.id] } },
        context(),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      proposals.patch(
        proposalId,
        {
          expected_version: 1,
          patch: { attachment_ids: [parsePrefixedId("fil_forged_reference", "fil")] },
        },
        context(),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    expect(
      await files.list({ entity_type: "challenge", entity_id: challengeId }, context()),
    ).toEqual([]);
  });
  it("keeps rejected and unavailable scans inaccessible, and supports explicit safe rescan", async () => {
    verdict = "rejected";
    const bad = await uploaded();
    await files.scanNext();
    expect((await files.get(bad, context())).state).toBe("rejected");
    await expect(files.downloadUrl(bad, context())).rejects.toMatchObject({ code: "NOT_FOUND" });
    verdict = "scan_failed";
    const failed = await uploaded();
    await files.scanNext();
    const failure = await files.get(failed, context());
    expect(failure.state).toBe("scan_failed");
    await expect(files.downloadUrl(failed, context())).rejects.toMatchObject({ code: "NOT_FOUND" });
    verdict = "clean";
    await files.complete(failed, failure.version, context());
    await files.scanNext();
    expect((await files.get(failed, context())).state).toBe("clean");
  });
  it("replays upload bytes without replacement and binds both-party downloads to submitted evidence", async () => {
    verdict = "clean";
    const requestContext = context();
    const request = await files.request(uploadBody(), requestContext);
    expect((await files.request(uploadBody(), requestContext)).receipt.idempotent).toBe(true);
    const token = new URL(request.upload_url, "http://local").searchParams.get("token")!;
    const uploadContext = context();
    const upload = await files.upload(request.file.id, token, bytes, uploadContext);
    expect(
      (await files.upload(request.file.id, token, bytes, uploadContext)).receipt.idempotent,
    ).toBe(true);
    await expect(
      files.upload(request.file.id, token, Buffer.from("%PDF-different"), uploadContext),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await files.complete(request.file.id, upload.file.version, context());
    await files.scanNext();
    await expect(files.get(request.file.id, context(true))).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await proposals.patch(
      proposalId,
      { expected_version: 1, patch: { attachment_ids: [request.file.id] } },
      context(),
    );
    await proposals.submit(
      proposalId,
      { expected_version: 2, accepted_challenge_version_id: publishedVersion },
      context(),
    );
    for (const org of [false, true]) {
      const scope = context(org);
      const grant = await files.downloadUrl(request.file.id, scope);
      const downloadToken = new URL(grant.download_url, "http://local").searchParams.get("token")!;
      expect((await files.download(request.file.id, downloadToken, scope)).content).toEqual(bytes);
      await expect(
        files.download(request.file.id, downloadToken, context(!org)),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
    const challengeFiles = await files.list(
      { entity_type: "challenge", entity_id: challengeId },
      context(),
    );
    expect(challengeFiles).toHaveLength(1);
    await expect(
      database.query("UPDATE file_object SET entity_id=$2 WHERE id=$1", [
        request.file.id,
        challengeId,
      ]),
    ).rejects.toMatchObject({ code: "55000" });
    await expect(runMigrations(database, "down")).rejects.toThrow("private file evidence exists");
    const grant = await files.downloadUrl(request.file.id, context(true));
    await database.query(
      "UPDATE access_grant SET state='expired' WHERE resource_type='proposal' AND resource_id=$1",
      [proposalId],
    );
    await expect(
      files.download(
        request.file.id,
        new URL(grant.download_url, "http://local").searchParams.get("token")!,
        context(true),
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(
      await files.list({ entity_type: "challenge", entity_id: challengeId }, context()),
    ).toEqual([]);
  });
});
