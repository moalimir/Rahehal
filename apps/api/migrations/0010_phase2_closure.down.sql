CREATE OR REPLACE FUNCTION protect_challenge_public_projection()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND (to_jsonb(NEW) - ARRAY['state', 'proposal_deadline'])
       = (to_jsonb(OLD) - ARRAY['state', 'proposal_deadline']) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'challenge public projections accept only state and deadline changes'
    USING ERRCODE = '55000';
END;
$$;
