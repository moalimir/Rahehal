DROP TRIGGER proposal_requires_published_challenge ON proposal;
DROP FUNCTION validate_proposal_challenge();
DROP TRIGGER proposal_version_evidence_protected ON proposal_version;
DROP FUNCTION protect_proposal_version_evidence();
ALTER TABLE proposal DROP CONSTRAINT proposal_current_version_fk;
DROP TABLE proposal_version;
DROP TABLE proposal;
