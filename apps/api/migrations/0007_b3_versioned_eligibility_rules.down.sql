DROP TRIGGER challenge_version_create_eligibility_rule ON challenge_version;
DROP FUNCTION create_eligibility_rule_for_challenge_version();
DROP TABLE eligibility_rule;
DROP FUNCTION prevent_eligibility_rule_mutation();
DROP FUNCTION validate_editable_challenge_eligibility_rule();
DROP FUNCTION valid_applicant_type_array(text[]);
