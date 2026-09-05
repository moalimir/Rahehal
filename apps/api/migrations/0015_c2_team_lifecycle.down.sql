DROP TRIGGER team_membership_identity_protected ON membership;
DROP FUNCTION protect_team_membership_identity();
DROP TRIGGER team_owner_checked_after_membership_change ON membership;
DROP FUNCTION check_team_owner_after_membership_change();
DROP TRIGGER team_owner_checked_after_team_change ON team_workspace;
DROP FUNCTION check_team_owner_after_team_change();
DROP TRIGGER team_owner_checked_after_workspace_change ON workspace;
DROP FUNCTION check_team_owner_after_workspace_change();
DROP FUNCTION enforce_team_owner_membership(text);
DROP INDEX team_one_active_owner_idx;

DROP TRIGGER team_membership_request_evidence_protected ON team_membership_request;
DROP FUNCTION protect_team_membership_request_evidence();
DROP INDEX team_membership_request_requester_idx;
DROP INDEX team_membership_request_one_pending_user_idx;
DROP TABLE team_membership_request;

DROP TRIGGER team_invitation_evidence_protected ON team_invitation;
DROP FUNCTION protect_team_invitation_evidence();
DROP INDEX team_invitation_recipient_idx;
DROP INDEX team_invitation_one_pending_email_idx;
DROP TABLE team_invitation;

DROP TRIGGER team_workspace_identity_protected ON team_workspace;
DROP FUNCTION protect_team_workspace_identity();
DROP TRIGGER team_workspace_kind_validated ON team_workspace;
DROP FUNCTION validate_team_workspace_kind();
DROP TABLE team_workspace;

ALTER TABLE membership DROP COLUMN lock_version;
