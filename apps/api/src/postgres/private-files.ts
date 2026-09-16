import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import {
  privateFileRoutes,
  privatePdfMaxBytes,
  type FileTarget,
  type PrivateFileResource,
  type PrivateFileMutationResource,
  type RequestFileUploadBody,
} from "@rahhal/contracts";
import {
  isEditableProposalState,
  organizationCapabilities,
  parseAuditEventId,
  parsePrefixedId,
  parseReceiptId,
  parseCorrelationId,
  parseTenantId,
  parseUserId,
  parseWorkspaceId,
} from "@rahhal/domain";
import type {
  ChallengePort,
  IdFactory,
  ProposalCommandContext,
  ProposalPort,
  ProposalScope,
} from "../ports.js";
import { ApiProblem, idempotencyConflict, notFound, staleVersion } from "../errors.js";
import { commandFingerprint } from "../primitives.js";
import { PrivatePdfStorage } from "../private-pdf-storage.js";
import { PostgresUnitOfWork } from "./unit-of-work.js";

type FileRow = {
  id: string;
  tenant_id: string;
  workspace_id: string;
  created_by_user_id: string;
  entity_type: "challenge" | "proposal";
  entity_id: string;
  filename: string;
  size_bytes: number;
  object_key: string;
  sha256: string | null;
  state: PrivateFileResource["state"];
  lock_version: number;
};
const parseFileId = (id: string) => parsePrefixedId(id, "fil");
const resource = (row: FileRow): PrivateFileResource => ({
  id: parseFileId(row.id),
  entity_type: row.entity_type,
  entity_id: row.entity_id,
  filename: row.filename,
  size: row.size_bytes,
  state: row.state,
  version: row.lock_version,
});
const route = (template: string, id: string) =>
  template.replace("{fileId}", encodeURIComponent(id));

export class PostgresPrivateFileAdapter {
  constructor(
    private readonly unit: PostgresUnitOfWork,
    private readonly ids: IdFactory,
    private readonly challenges: ChallengePort,
    private readonly proposals: ProposalPort,
    private readonly storage: PrivatePdfStorage,
  ) {}

  private async editable(
    target: FileTarget,
    scope: ProposalScope,
    expected?: number,
  ): Promise<void> {
    const client = this.unit.currentClient();
    if (target.entity_type === "proposal") {
      await client.query(
        "SELECT id FROM proposal WHERE id=$1 AND tenant_id=$2 AND owner_workspace_id=$3 FOR UPDATE",
        [target.entity_id, scope.tenantId, scope.workspaceId],
      );
      const record = await this.proposals.getScoped(scope, target.entity_id);
      if (!record) throw notFound();
      if (!isEditableProposalState(record.state))
        throw new ApiProblem(409, "INVALID_STATE", "Proposal is locked");
      if (expected !== undefined && record.version !== expected) throw staleVersion(record.version);
    } else {
      if (!organizationCapabilities(scope.role).authorChallenges) throw notFound();
      await client.query(
        "SELECT id FROM challenge WHERE id=$1 AND tenant_id=$2 AND workspace_id=$3 FOR UPDATE",
        [target.entity_id, scope.tenantId, scope.workspaceId],
      );
      const record = await this.challenges.getScoped(scope, target.entity_id);
      if (!record) throw notFound();
      if (record.published_version_id)
        throw new ApiProblem(409, "INVALID_STATE", "Challenge is published");
      if (expected !== undefined && record.version !== expected) throw staleVersion(record.version);
    }
  }

  private async owned(id: string, scope: ProposalScope): Promise<FileRow> {
    const result = await this.unit
      .currentClient()
      .query<FileRow>(
        "SELECT * FROM file_object WHERE id=$1 AND tenant_id=$2 AND workspace_id=$3 FOR UPDATE",
        [id, scope.tenantId, scope.workspaceId],
      );
    const row = result.rows[0];
    if (!row) throw notFound();
    await this.editable(row, scope);
    return row;
  }

  private async accessibleRows(
    id: string | null,
    scope: ProposalScope,
    target?: FileTarget,
  ): Promise<FileRow[]> {
    // Scope the query before revealing even a filename. Shared proposal files
    // must occur in the exact locked version named by the active bilateral grant.
    const result = await this.unit.currentClient().query<FileRow>(
      `SELECT file.* FROM file_object AS file WHERE ($1::text IS NULL OR file.id=$1)
        AND ($4::text IS NULL OR (file.entity_type=$4 AND file.entity_id=$5)) AND (
        (file.tenant_id=$2 AND file.workspace_id=$3)
        OR (file.entity_type='proposal' AND EXISTS (
          SELECT 1 FROM access_grant g JOIN proposal_version v ON v.id=g.proposal_version_id
          WHERE g.grantee_tenant_id=$2 AND g.grantee_workspace_id=$3
            AND g.resource_type='proposal' AND g.resource_id=file.entity_id AND g.capability='read'
            AND g.state='active' AND g.valid_from<=transaction_timestamp() AND g.expires_at>transaction_timestamp()
            AND v.proposal_id=file.entity_id AND v.locked_at IS NOT NULL
            AND v.content->'attachment_ids' ? file.id))
        OR (file.entity_type='challenge' AND EXISTS (
          SELECT 1 FROM challenge c JOIN challenge_version v ON v.id=c.published_version_id
          WHERE c.id=file.entity_id AND v.content->'attachment_ids' ? file.id
            AND (COALESCE((v.content->>'nda_required')::boolean,false)=false OR EXISTS (
              SELECT 1 FROM eligibility_gate_acceptance a WHERE a.tenant_id=$2 AND a.workspace_id=$3
                AND a.challenge_version_id=v.id AND a.gate='nda'))
            AND (EXISTS (SELECT 1 FROM access_grant g JOIN direct_offer o ON o.id=g.direct_offer_id
              WHERE g.grantee_tenant_id=$2 AND g.grantee_workspace_id=$3 AND g.resource_type='challenge'
                AND g.resource_id=c.id AND g.capability='read' AND g.state='active'
                AND g.valid_from<=transaction_timestamp() AND g.expires_at>transaction_timestamp()
                AND o.recipient_tenant_id=$2 AND o.recipient_workspace_id=$3
                AND o.sender_tenant_id=c.tenant_id AND o.sender_organization_workspace_id=c.workspace_id
                AND o.challenge_version_id=v.id AND o.state NOT IN ('declined','cancelled','expired')
                AND o.response_deadline>transaction_timestamp())
              OR EXISTS (SELECT 1 FROM proposal p JOIN access_grant g ON g.resource_id=p.id
                JOIN proposal_version pv ON pv.id=g.proposal_version_id
                WHERE p.tenant_id=$2 AND p.owner_workspace_id=$3 AND p.challenge_id=c.id
                  AND p.state<>'withdrawn' AND pv.proposal_id=p.id AND pv.locked_at IS NOT NULL
                  AND pv.accepted_challenge_version_id=v.id
                  AND g.resource_type='proposal' AND g.capability='read' AND g.state='active'
                  AND g.grantee_tenant_id=c.tenant_id AND g.grantee_workspace_id=c.workspace_id
                  AND g.valid_from<=transaction_timestamp() AND g.expires_at>transaction_timestamp()))))
      ) ORDER BY file.created_at LIMIT 100 FOR SHARE OF file`,
      [
        id,
        scope.tenantId,
        scope.workspaceId,
        target?.entity_type ?? null,
        target?.entity_id ?? null,
      ],
    );
    for (const row of result.rows) {
      if (row.tenant_id === scope.tenantId && row.workspace_id === scope.workspaceId) {
        if (
          row.entity_type === "proposal" &&
          !(await this.proposals.getScoped(scope, row.entity_id))
        )
          throw notFound();
        if (
          row.entity_type === "challenge" &&
          (!scope.role.startsWith("org:") ||
            !(await this.challenges.getScoped(scope, row.entity_id)))
        )
          throw notFound();
      } else if (
        row.entity_type === "proposal" &&
        (!scope.role.startsWith("org:") ||
          !(await this.proposals.getForOrganization(scope, row.entity_id)))
      )
        throw notFound();
    }
    return result.rows;
  }
  private async readable(id: string, scope: ProposalScope): Promise<FileRow> {
    const row = (await this.accessibleRows(id, scope))[0];
    if (!row) throw notFound();
    return row;
  }

  private async replay(
    context: ProposalCommandContext,
    hash: string,
  ): Promise<PrivateFileMutationResource | null> {
    const client = this.unit.currentClient();
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      `${context.tenantId}:${context.idempotencyKey}`,
    ]);
    const result = await client.query<{
      request_hash: string;
      response_body: PrivateFileMutationResource;
    }>(
      "SELECT request_hash,response_body FROM idempotency_key WHERE scope_kind='tenant' AND tenant_id=$1 AND idempotency_key=$2",
      [context.tenantId, context.idempotencyKey],
    );
    const cached = result.rows[0];
    if (!cached) return null;
    if (cached.request_hash !== hash) throw idempotencyConflict();
    return {
      ...cached.response_body,
      receipt: { ...cached.response_body.receipt, idempotent: true },
    };
  }

  private async record(
    row: FileRow,
    context: Pick<
      ProposalCommandContext,
      "actorUserId" | "correlationId" | "idempotencyKey" | "tenantId" | "workspaceId"
    >,
    action: string,
    hash?: string,
    system = false,
  ): Promise<PrivateFileMutationResource> {
    const client = this.unit.currentClient();
    const now = new Date().toISOString();
    const audit = parseAuditEventId(this.ids.next("aud"));
    const receipt = parseReceiptId(this.ids.next("rcp"));
    const next =
      row.state === "clean"
        ? ["attach"]
        : row.state === "awaiting_upload"
          ? ["upload"]
          : ["check_scan"];
    await client.query(
      `INSERT INTO audit_event(id,correlation_id,tenant_id,workspace_id,actor_kind,actor_user_id,action,outcome,reason_code,target_type,target_id,metadata,occurred_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,'success','MUTATION_COMMITTED','file',$8,jsonb_build_object('entity_version',$9::integer),$10)`,
      [
        audit,
        context.correlationId,
        row.tenant_id,
        row.workspace_id,
        system ? "system" : "user",
        system ? null : context.actorUserId,
        action,
        row.id,
        row.lock_version,
        now,
      ],
    );
    await client.query(
      `INSERT INTO mutation_receipt(id,tenant_id,workspace_id,entity_type,entity_id,entity_version,audit_event_id,correlation_id,next_actions,occurred_at)
      VALUES($1,$2,$3,'file',$4,$5,$6,$7,$8::jsonb,$9)`,
      [
        receipt,
        row.tenant_id,
        row.workspace_id,
        row.id,
        row.lock_version,
        audit,
        context.correlationId,
        JSON.stringify(next),
        now,
      ],
    );
    await client.query(
      `INSERT INTO outbox_event(id,tenant_id,correlation_id,event_type,schema_version,aggregate_type,aggregate_id,payload,dedupe_key,occurred_at,available_at)
      VALUES($1,$2,$3,$4,1,'file',$5,jsonb_build_object('entity_version',$6::integer),$7,$8,$8)`,
      [
        this.ids.next("evt"),
        row.tenant_id,
        context.correlationId,
        action,
        row.id,
        row.lock_version,
        `${action}:${row.id}:${row.lock_version}`,
        now,
      ],
    );
    const outcome = {
      file: resource(row),
      receipt: {
        entity_id: parseFileId(row.id),
        receipt_id: receipt,
        audit_event_id: audit,
        timestamp: now,
        idempotent: false,
        next_actions: next,
      },
    };
    if (hash)
      await client.query(
        `INSERT INTO idempotency_key(id,scope_kind,tenant_id,idempotency_key,request_hash,status,response_status,response_body,created_at,expires_at)
      VALUES($1,'tenant',$2,$3,$4,'completed',200,$5::jsonb,$6,$6::timestamptz+interval '24 hours')`,
        [
          "idk_" + commandFingerprint({ tenant: context.tenantId, key: context.idempotencyKey }),
          context.tenantId,
          context.idempotencyKey,
          hash,
          JSON.stringify(outcome),
          now,
        ],
      );
    return outcome;
  }

  async request(body: RequestFileUploadBody, context: ProposalCommandContext) {
    return this.unit.run(async () => {
      if (
        body.mime !== "application/pdf" ||
        body.classification !== "confidential" ||
        !Number.isSafeInteger(body.size) ||
        body.size < 1 ||
        body.size > privatePdfMaxBytes ||
        !/^[^/\\\x00-\x1f\x7f]{1,176}\.pdf$/i.test(body.filename) ||
        !["challenge", "proposal"].includes(body.entity_type)
      )
        throw new ApiProblem(422, "VALIDATION", "Only bounded confidential PDFs are accepted");
      await this.editable(body, context);
      const hash = commandFingerprint({
        action: "file.request",
        actor: context.actorUserId,
        workspace: context.workspaceId,
        body,
      });
      let outcome = await this.replay(context, hash);
      if (!outcome) {
        await this.editable(body, context, body.expected_version);
        const client = this.unit.currentClient();
        // Bounded quota includes unfinished uploads so abandoned reservations do not permit abuse.
        await client.query("SELECT id FROM workspace WHERE id=$1 AND tenant_id=$2 FOR UPDATE", [
          context.workspaceId,
          context.tenantId,
        ]);
        const quota = await client.query<{ bytes: string; count: string }>(
          "SELECT COALESCE(sum(size_bytes),0)::text AS bytes,count(*)::text AS count FROM file_object WHERE tenant_id=$1 AND workspace_id=$2",
          [context.tenantId, context.workspaceId],
        );
        if (
          Number(quota.rows[0]!.bytes) + body.size > 100 * 1024 * 1024 ||
          Number(quota.rows[0]!.count) >= 100
        )
          throw new ApiProblem(429, "RATE_LIMITED", "Private file workspace quota reached");
        const inserted = await client.query<FileRow>(
          `INSERT INTO file_object(id,tenant_id,workspace_id,created_by_user_id,entity_type,entity_id,filename,size_bytes,object_key,state)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'awaiting_upload') RETURNING *`,
          [
            this.ids.next("fil"),
            context.tenantId,
            context.workspaceId,
            context.actorUserId,
            body.entity_type,
            body.entity_id,
            body.filename,
            body.size,
            this.storage.key(),
          ],
        );
        outcome = await this.record(inserted.rows[0]!, context, "file.upload_requested", hash);
      }
      const expires = Date.now() + 5 * 60_000;
      return {
        ...outcome,
        upload_url: `${route(privateFileRoutes.upload, outcome.file.id)}?token=${this.storage.sign(this.binding(context, outcome.file.id, "upload"), expires)}`,
        expires_at: new Date(expires).toISOString(),
      };
    });
  }
  private binding(scope: ProposalScope, id: string, action: string) {
    return `${action}:${scope.actorUserId}:${scope.tenantId}:${scope.workspaceId}:${id}`;
  }
  async upload(id: string, token: string, content: Buffer, context: ProposalCommandContext) {
    return this.unit.run(async () => {
      this.storage.verify(token, this.binding(context, id, "upload"));
      const row = await this.owned(id, context);
      const hash = commandFingerprint({
        action: "file.upload",
        id,
        actor: context.actorUserId,
        workspace: context.workspaceId,
        digest: createHash("sha256").update(content).digest("hex"),
      });
      const replay = await this.replay(context, hash);
      if (replay) return replay;
      if (row.state !== "awaiting_upload")
        throw new ApiProblem(409, "INVALID_STATE", "Upload already finalized");
      if (content.length !== row.size_bytes || !content.subarray(0, 5).equals(Buffer.from("%PDF-")))
        throw new ApiProblem(422, "VALIDATION", "PDF bytes do not match the upload declaration");
      const digest = await this.storage.put(row.object_key, content);
      const updated = await this.unit
        .currentClient()
        .query<FileRow>(
          "UPDATE file_object SET state='quarantined',sha256=$2,lock_version=lock_version+1 WHERE id=$1 RETURNING *",
          [id, digest],
        );
      return this.record(updated.rows[0]!, context, "file.quarantined", hash);
    });
  }
  async complete(id: string, expected: number, context: ProposalCommandContext) {
    return this.unit.run(async () => {
      const row = await this.owned(id, context);
      const hash = commandFingerprint({
        action: "file.complete",
        id,
        expected,
        actor: context.actorUserId,
        workspace: context.workspaceId,
      });
      const replay = await this.replay(context, hash);
      if (replay) return replay;
      if (row.lock_version !== expected) throw staleVersion(row.lock_version);
      if (!["quarantined", "scan_failed"].includes(row.state))
        throw new ApiProblem(409, "INVALID_STATE", "File is not awaiting scan");
      const updated = await this.unit
        .currentClient()
        .query<FileRow>(
          "UPDATE file_object SET state='pending_scan',lock_version=lock_version+1 WHERE id=$1 RETURNING *",
          [id],
        );
      return this.record(updated.rows[0]!, context, "file.scan_requested", hash);
    });
  }
  async get(id: string, scope: ProposalScope) {
    return this.unit.run(async () => resource(await this.readable(id, scope)));
  }
  async list(target: FileTarget, scope: ProposalScope) {
    return this.unit.run(async () =>
      (await this.accessibleRows(null, scope, target)).map(resource),
    );
  }
  async downloadUrl(id: string, scope: ProposalScope) {
    return this.unit.run(async () => {
      const row = await this.readable(id, scope);
      if (row.state !== "clean") throw notFound();
      const expires = Date.now() + 60_000;
      return {
        download_url: `${route(privateFileRoutes.content, id)}?token=${this.storage.sign(this.binding(scope, id, "download"), expires)}`,
        expires_at: new Date(expires).toISOString(),
      };
    });
  }
  async download(id: string, token: string, scope: ProposalScope) {
    return this.unit.run(async () => {
      this.storage.verify(token, this.binding(scope, id, "download"));
      const row = await this.readable(id, scope);
      if (row.state !== "clean") throw notFound();
      const content = await this.storage.read(row.object_key);
      if (
        content.length !== row.size_bytes ||
        createHash("sha256").update(content).digest("hex") !== row.sha256
      )
        throw new ApiProblem(503, "STORAGE", "Private file integrity check failed");
      return { filename: row.filename, content };
    });
  }
  async scanNext(): Promise<boolean> {
    return this.unit.run(async () => {
      const client = this.unit.currentClient();
      const row = (
        await client.query<FileRow>(
          "SELECT * FROM file_object WHERE state='pending_scan' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1",
        )
      ).rows[0];
      if (!row) return false;
      let state: "clean" | "rejected" | "scan_failed" = "scan_failed";
      try {
        const content = await this.storage.read(row.object_key);
        if (
          createHash("sha256").update(content).digest("hex") === row.sha256 &&
          content.length === row.size_bytes
        )
          state = await this.storage.scanner.scan(this.storage.path(row.object_key), content);
      } catch {
        state = "scan_failed";
      }
      const updated = (
        await client.query<FileRow>(
          "UPDATE file_object SET state=$2,scanned_at=clock_timestamp(),lock_version=lock_version+1 WHERE id=$1 RETURNING *",
          [row.id, state],
        )
      ).rows[0]!;
      await this.record(
        updated,
        {
          tenantId: parseTenantId(row.tenant_id),
          workspaceId: parseWorkspaceId(row.workspace_id),
          actorUserId: parseUserId(row.created_by_user_id),
          idempotencyKey: `scan-${row.id}-${row.lock_version}`,
          correlationId: parseCorrelationId(this.ids.next("cor")),
        },
        `file.${state}`,
        undefined,
        true,
      );
      return true;
    });
  }
}

/** Same gate at application and database boundaries; invalid old metadata must
 * be removed/re-uploaded, never silently promoted to a real attachment. */
export async function assertPrivateAttachments(
  client: PoolClient,
  scope: { tenantId: string; workspaceId: string },
  target: FileTarget,
  ids: readonly string[],
) {
  if (!ids.length) return;
  const result = await client.query(
    "SELECT id FROM file_object WHERE tenant_id=$1 AND workspace_id=$2 AND entity_type=$3 AND entity_id=$4 AND id=ANY($5::text[]) AND state='clean' FOR SHARE",
    [scope.tenantId, scope.workspaceId, target.entity_type, target.entity_id, ids],
  );
  if (result.rowCount !== new Set(ids).size)
    throw new ApiProblem(422, "VALIDATION", "Attachments must be clean and bound to this record", {
      fields: [
        {
          path: "/attachment_ids",
          code: "invalid_attachment",
          message: "Upload and scan each PDF for this record before attaching it.",
        },
      ],
    });
}
