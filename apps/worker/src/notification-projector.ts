import type { OutboxEvent } from "@rahhal/contracts";
import { notificationProjectionFor, type NotificationAudience } from "@rahhal/domain";
import type { PoolClient } from "pg";

import type { OutboxDeliveryContext, OutboxHandler } from "./ports.js";

type Recipient = {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly userId: string;
  /**
   * The team workspace a team notification points at, when that is not the
   * workspace the recipient reads it in. An invitee has no membership in the
   * team yet, so the row is scoped to their own workspace while still naming
   * the team it is about.
   */
  readonly subjectWorkspaceId?: string | null;
};

type Subject = {
  readonly type: "proposal" | "team" | "direct_offer";
  readonly id: string;
};

/**
 * Projects allowlisted outbox events into per-recipient notifications.
 *
 * Recipients are resolved by reading the aggregate inside the delivery
 * transaction, never from the event payload: payloads carry stable identifiers
 * and versions only, so the projector cannot be fed a recipient by whoever
 * emitted the event. Nothing from the aggregate's content is copied into the
 * notification -- only the kind and the subject reference a later authorized
 * read can follow.
 */
export class NotificationProjector implements OutboxHandler<PoolClient> {
  constructor(private readonly ids: { next(prefix: "ntf"): string }) {}

  async handle(
    event: OutboxEvent,
    _context: OutboxDeliveryContext,
    client: PoolClient,
  ): Promise<void> {
    const projection = notificationProjectionFor(event.event_type);
    if (!projection) return;
    const subject = subjectFor(event);
    if (!subject) return;
    const recipients = await this.resolve(client, projection.audience, subject);
    for (const recipient of recipients) {
      await client.query(
        `INSERT INTO notification (
           id, tenant_id, workspace_id, user_id, kind, subject_type, subject_id,
           source_event_id, correlation_id, occurred_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (source_event_id, user_id) DO NOTHING`,
        [
          this.ids.next("ntf"),
          recipient.tenantId,
          recipient.workspaceId,
          recipient.userId,
          projection.kind,
          subject.type,
          // A team notification points at the team workspace, not at the
          // invitation or request row the event was emitted against. That is
          // the recipient's own workspace in every case but a pending
          // invitation, where the invitee is not a member yet.
          subject.type === "team"
            ? (recipient.subjectWorkspaceId ?? recipient.workspaceId)
            : subject.id,
          event.event_id,
          event.correlation_id,
          event.occurred_at,
        ],
      );
    }
  }

  private async resolve(
    client: PoolClient,
    audience: NotificationAudience,
    subject: Subject,
  ): Promise<readonly Recipient[]> {
    switch (audience) {
      case "proposal-owner":
        return rows(
          await client.query<Recipient>(
            `SELECT membership.tenant_id AS "tenantId",
                    membership.workspace_id AS "workspaceId",
                    membership.user_id AS "userId"
             FROM proposal
             JOIN membership ON membership.workspace_id = proposal.owner_workspace_id
              AND membership.tenant_id = proposal.tenant_id
              AND membership.state = 'active'
             WHERE proposal.id = $1`,
            [subject.id],
          ),
        );
      case "challenge-organization":
        return rows(
          await client.query<Recipient>(
            `SELECT membership.tenant_id AS "tenantId",
                    membership.workspace_id AS "workspaceId",
                    membership.user_id AS "userId"
             FROM proposal
             JOIN challenge ON challenge.id = proposal.challenge_id
             JOIN membership ON membership.workspace_id = challenge.workspace_id
              AND membership.tenant_id = challenge.tenant_id
              AND membership.state = 'active'
             WHERE proposal.id = $1`,
            [subject.id],
          ),
        );
      case "team-managers":
        return rows(
          await client.query<Recipient>(
            `SELECT membership.tenant_id AS "tenantId",
                    membership.workspace_id AS "workspaceId",
                    membership.user_id AS "userId"
             FROM team_membership_request AS request
             JOIN membership ON membership.workspace_id = request.workspace_id
              AND membership.state = 'active'
              AND membership.role IN ('team:owner', 'team:admin')
             WHERE request.id = $1`,
            [subject.id],
          ),
        );
      case "team-invitation-recipient":
      case "team-invitation-sender":
      case "team-membership-requester":
        return this.teamParty(client, audience, subject.id);
      case "offer-recipient":
        return rows(
          await client.query<Recipient>(
            `SELECT membership.tenant_id AS "tenantId",
                    membership.workspace_id AS "workspaceId",
                    membership.user_id AS "userId"
             FROM direct_offer
             JOIN membership ON membership.workspace_id = direct_offer.recipient_workspace_id
              AND membership.tenant_id = direct_offer.recipient_tenant_id
              AND membership.state = 'active'
             WHERE direct_offer.id = $1`,
            [subject.id],
          ),
        );
      case "offer-sender":
        return rows(
          await client.query<Recipient>(
            `SELECT membership.tenant_id AS "tenantId",
                    membership.workspace_id AS "workspaceId",
                    membership.user_id AS "userId"
             FROM direct_offer
             JOIN membership
               ON membership.workspace_id = direct_offer.sender_organization_workspace_id
              AND membership.tenant_id = direct_offer.sender_tenant_id
              AND membership.state = 'active'
             WHERE direct_offer.id = $1`,
            [subject.id],
          ),
        );
    }
  }

  private async teamParty(
    client: PoolClient,
    audience: NotificationAudience,
    subjectId: string,
  ): Promise<readonly Recipient[]> {
    if (audience === "team-invitation-recipient") {
      // An invitation is delivered to the invitee's own workspace, because
      // being invited is precisely the state of not being a member yet: the
      // earlier join against the team's membership matched nothing, so
      // `team.invitation.sent` reached nobody and the invitee was told only by
      // opening the team page on their own initiative.
      //
      // An invitation addressed to a contact that is not a user yet still
      // notifies nobody -- C8 reads no contact details -- and that person is
      // reached out of band instead.
      return rows(
        await client.query<Recipient>(
          `SELECT membership.tenant_id AS "tenantId",
                  membership.workspace_id AS "workspaceId",
                  membership.user_id AS "userId",
                  team_invitation.workspace_id AS "subjectWorkspaceId"
           FROM team_invitation
           JOIN membership ON membership.user_id = team_invitation.recipient_user_id
            AND membership.state = 'active'
           JOIN workspace ON workspace.id = membership.workspace_id
            AND workspace.kind = 'individual'
           WHERE team_invitation.id = $1 AND team_invitation.recipient_user_id IS NOT NULL`,
          [subjectId],
        ),
      );
    }
    if (audience === "team-invitation-sender") {
      return rows(
        await client.query<Recipient>(
          `SELECT membership.tenant_id AS "tenantId",
                  membership.workspace_id AS "workspaceId",
                  membership.user_id AS "userId"
           FROM team_invitation
           JOIN membership ON membership.user_id = team_invitation.inviter_user_id
            AND membership.workspace_id = team_invitation.workspace_id
            AND membership.state = 'active'
           WHERE team_invitation.id = $1`,
          [subjectId],
        ),
      );
    }
    return rows(
      await client.query<Recipient>(
        `SELECT membership.tenant_id AS "tenantId",
                membership.workspace_id AS "workspaceId",
                membership.user_id AS "userId"
         FROM team_membership_request
         JOIN membership ON membership.user_id = team_membership_request.requester_user_id
          AND membership.workspace_id = team_membership_request.workspace_id
          AND membership.state = 'active'
         WHERE team_membership_request.id = $1`,
        [subjectId],
      ),
    );
  }
}

function rows(result: { readonly rows: readonly Recipient[] }): readonly Recipient[] {
  return result.rows;
}

/**
 * The aggregate the event names. Team lifecycle events are emitted against the
 * invitation or request row, which is what resolves the party, while the
 * notification stores the team workspace the recipient can actually open.
 */
function subjectFor(event: OutboxEvent): Subject | null {
  switch (event.aggregate_type) {
    case "proposal":
      return { type: "proposal", id: event.aggregate_id };
    case "direct_offer":
      return { type: "direct_offer", id: event.aggregate_id };
    case "team":
    case "team_invitation":
    case "team_membership_request":
      return { type: "team", id: event.aggregate_id };
    default:
      return null;
  }
}
