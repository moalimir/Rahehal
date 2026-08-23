export const DRAFT_ID_POOL = Array.from(
  { length: 8 },
  (_, index) => `CH-DRAFT-${String(index + 1).padStart(3, "0")}`,
);

export const SEEDED_CHALLENGE_IDS = ["CH-1405-021", "CH-1405-034", "CH-1405-041", "CH-1405-052"];

export const CHALLENGE_ROUTE_IDS = [...SEEDED_CHALLENGE_IDS, ...DRAFT_ID_POOL];
