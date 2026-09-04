DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM direct_offer)
     OR EXISTS (SELECT 1 FROM saved_opportunity) THEN
    RAISE EXCEPTION 'refusing to remove C6 opportunity or direct-offer evidence'
      USING ERRCODE = '55000';
  END IF;
END;
$$;

DROP TRIGGER c6_offer_grant_coherent ON access_grant;
DROP TRIGGER c6_offer_response_coherent ON offer_response;
DROP TRIGGER c6_direct_offer_coherent ON direct_offer;
DROP FUNCTION validate_c6_offer_coherence();
DROP TRIGGER c6_offer_access_grant_validated ON access_grant;
DROP FUNCTION validate_c6_offer_access_grant();
DROP TRIGGER c6_offer_response_protected ON offer_response;
DROP FUNCTION protect_c6_offer_response();
DROP TRIGGER c6_direct_offer_protected ON direct_offer;
DROP FUNCTION protect_c6_direct_offer();
DROP TRIGGER c6_saved_opportunity_validated ON saved_opportunity;
DROP FUNCTION validate_c6_saved_opportunity();

DROP INDEX access_grant_one_active_capability_idx;
CREATE UNIQUE INDEX access_grant_one_active_capability_idx
  ON access_grant (
    grantor_tenant_id, grantor_workspace_id, grantee_tenant_id,
    grantee_workspace_id, resource_type, resource_id, capability
  )
  WHERE state = 'active';

ALTER TABLE access_grant
  DROP CONSTRAINT access_grant_direct_offer_shape,
  DROP CONSTRAINT access_grant_direct_offer_fk,
  DROP COLUMN direct_offer_id,
  DROP CONSTRAINT access_grant_resource_type_check,
  ADD CONSTRAINT access_grant_resource_type_check CHECK (
    resource_type IN ('challenge', 'proposal', 'case', 'file')
  );

DROP TABLE offer_response;
DROP FUNCTION valid_offer_response_content(jsonb);
DROP TABLE direct_offer;
DROP TABLE saved_opportunity;
