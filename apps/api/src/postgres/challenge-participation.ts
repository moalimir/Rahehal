import type { PoolClient } from "pg";

import type { WorkspaceScope } from "../ports.js";

/** Called only after the caller establishes challenge reachability. Free-text
 * invitees never confer authority. Lock live invitations so cancellation cannot
 * race a submission that depends on them. Hybrid outreach remains open. */
export async function challengeParticipation(
  client: PoolClient,
  scope: WorkspaceScope,
  challengeId: string,
): Promise<{ invitationRequired: boolean; hasActiveInvitation: boolean }> {
  const policy = await client.query<{ required: boolean }>(
    `SELECT (COALESCE(projection.sourcing_model, version.content->>'sourcing_model') = 'private'
             OR COALESCE(projection.visibility, version.content->>'visibility') = 'invite_only') AS required
     FROM challenge
     JOIN challenge_version AS version ON version.id = challenge.published_version_id
     LEFT JOIN challenge_public_projection AS projection
       ON projection.challenge_id = challenge.id AND projection.challenge_version_id = version.id
     WHERE challenge.id = $1`,
    [challengeId],
  );
  const invitation = await client.query(
    `SELECT grant_row.id
     FROM access_grant AS grant_row
     JOIN direct_offer AS offer ON offer.id = grant_row.direct_offer_id
     JOIN challenge ON challenge.id = offer.challenge_id
     WHERE grant_row.grantee_tenant_id = $1 AND grant_row.grantee_workspace_id = $2
       AND grant_row.resource_type = 'challenge' AND grant_row.resource_id = $3
       AND grant_row.capability = 'read' AND grant_row.state = 'active'
       AND grant_row.valid_from <= transaction_timestamp()
       AND grant_row.expires_at > transaction_timestamp()
       AND offer.recipient_tenant_id = $1 AND offer.recipient_workspace_id = $2
       AND offer.challenge_version_id = challenge.published_version_id
       AND offer.sender_tenant_id = challenge.tenant_id
       AND offer.sender_organization_workspace_id = challenge.workspace_id
       AND offer.state NOT IN ('declined','expired','cancelled')
       AND offer.response_deadline > transaction_timestamp()
     FOR SHARE OF grant_row, offer`,
    [scope.tenantId, scope.workspaceId, challengeId],
  );
  return {
    invitationRequired: policy.rows[0]?.required ?? true,
    hasActiveInvitation: (invitation.rowCount ?? 0) > 0,
  };
}
