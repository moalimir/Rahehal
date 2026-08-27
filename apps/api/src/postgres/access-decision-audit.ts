import { parseAuditEventId } from "@rahhal/domain";

import type { AccessDecisionAuditPort, AccessDecisionRecord, IdFactory } from "../ports.js";
import { PostgresUnitOfWork } from "./unit-of-work.js";

export class PostgresAccessDecisionAudit implements AccessDecisionAuditPort {
  constructor(
    private readonly unitOfWork: PostgresUnitOfWork,
    private readonly ids: IdFactory,
  ) {}

  async record(decision: AccessDecisionRecord): Promise<void> {
    const write = async () => {
      const tenantId = decision.tenantId ?? null;
      const workspaceId = tenantId === null ? null : (decision.workspaceId ?? null);
      const hasTarget = decision.entityType !== undefined && decision.entityId !== undefined;

      await this.unitOfWork.currentClient().query(
        `
          INSERT INTO audit_event (
            id,
            correlation_id,
            tenant_id,
            workspace_id,
            actor_kind,
            actor_user_id,
            action,
            outcome,
            reason_code,
            target_type,
            target_id,
            metadata,
            occurred_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, '{}'::jsonb, $12)
        `,
        [
          parseAuditEventId(this.ids.next("aud")),
          decision.correlationId,
          tenantId,
          workspaceId,
          decision.actorUserId ? "user" : "anonymous",
          decision.actorUserId ?? null,
          decision.action,
          decision.outcome,
          decision.reason ?? (decision.outcome === "success" ? "ALLOWED" : "DENIED"),
          hasTarget ? decision.entityType : null,
          hasTarget ? decision.entityId : null,
          decision.occurredAt,
        ],
      );
    };

    if (this.unitOfWork.isActive()) {
      await write();
      return;
    }
    await this.unitOfWork.run(write);
  }
}
