-- A published challenge version has one rubric aggregate and append-only versions.
CREATE UNIQUE INDEX rubric_challenge_version_unique ON rubric (challenge_version_id);

CREATE FUNCTION valid_mvp_rubric_criteria(criteria jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE item jsonb; total numeric := 0; seen text[] := '{}';
BEGIN
  IF jsonb_typeof(criteria) <> 'array' OR jsonb_array_length(criteria) NOT BETWEEN 1 AND 20 THEN RETURN false; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(criteria) LOOP
    IF jsonb_typeof(item) <> 'object' THEN RETURN false; END IF;
    IF (SELECT count(*) FROM jsonb_object_keys(item)) <> 5 OR NOT item ?& ARRAY['id','label','weight','min','max'] THEN RETURN false; END IF;
    IF jsonb_typeof(item->'id') <> 'string' OR (item->>'id') !~ '^[a-z][a-z0-9_-]{0,39}$' OR (item->>'id') = ANY(seen) THEN RETURN false; END IF;
    seen := array_append(seen, item->>'id');
    IF jsonb_typeof(item->'label') <> 'string' OR length(item->>'label') NOT BETWEEN 1 AND 160 OR (item->>'label') !~ '[^[:space:]]' THEN RETURN false; END IF;
    IF jsonb_typeof(item->'weight') <> 'number' OR (item->>'weight')::numeric NOT BETWEEN 1 AND 100 OR mod((item->>'weight')::numeric,1) <> 0 THEN RETURN false; END IF;
    IF item->'min' <> '0'::jsonb OR item->'max' <> '5'::jsonb THEN RETURN false; END IF;
    total := total + (item->>'weight')::numeric;
  END LOOP;
  RETURN total = 100;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN false;
END;
$$;
ALTER TABLE rubric_version ADD CONSTRAINT rubric_mvp_criteria CHECK (valid_mvp_rubric_criteria(criteria));
