/** DEC-2026-019: the MVP has one scoring scale, bound to immutable rubric versions. */
export type RubricCriterion = {
  readonly id: string;
  readonly label: string;
  readonly weight: number;
  readonly min: 0;
  readonly max: 5;
};
export type CriterionScore = {
  readonly criterion_id: string;
  readonly value: number;
  readonly rationale: string;
};
export type RubricIssue = {
  readonly path: string;
  readonly code: "required" | "invalid" | "duplicate" | "weight_total" | "unknown_criterion";
  readonly message: string;
};
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Whole percentage weights keep the calculation exact without rounding a ranking. */
export function validateRubricCriteria(value: unknown): readonly RubricIssue[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20)
    return [{ path: "criteria", code: "invalid", message: "Rubric requires 1 to 20 criteria" }];
  const issues: RubricIssue[] = [];
  const seen = new Set<string>();
  let total = 0;
  value.forEach((item: unknown, index: number) => {
    const path = `criteria.${index}`;
    if (!isRecord(item)) {
      issues.push({ path, code: "invalid", message: "Criterion must be an object" });
      return;
    }
    if (Object.keys(item).some((key) => !["id", "label", "weight", "min", "max"].includes(key)))
      issues.push({ path, code: "invalid", message: "Unknown criterion property" });
    if (typeof item.id !== "string" || !/^[a-z][a-z0-9_-]{0,39}$/.test(item.id))
      issues.push({ path: `${path}.id`, code: "invalid", message: "Invalid criterion identifier" });
    else if (seen.has(item.id))
      issues.push({
        path: `${path}.id`,
        code: "duplicate",
        message: "Criterion identifiers must be unique",
      });
    else seen.add(item.id);
    if (typeof item.label !== "string" || item.label.trim().length < 1 || item.label.length > 160)
      issues.push({
        path: `${path}.label`,
        code: "required",
        message: "Criterion label is required (up to 160 characters)",
      });
    if (
      !Number.isInteger(item.weight) ||
      typeof item.weight !== "number" ||
      item.weight < 1 ||
      item.weight > 100
    )
      issues.push({
        path: `${path}.weight`,
        code: "invalid",
        message: "Weight must be a whole percentage from 1 to 100",
      });
    else total += item.weight;
    if (item.min !== 0 || item.max !== 5)
      issues.push({ path, code: "invalid", message: "The MVP scoring range is 0 to 5" });
  });
  if (total !== 100)
    issues.push({
      path: "criteria",
      code: "weight_total",
      message: "Criterion weights must total 100 percent",
    });
  return issues;
}

export type RubricScoreResult =
  | { readonly ok: true; readonly weighted_score_tenths: number }
  | { readonly ok: false; readonly issues: readonly RubricIssue[] };

/** Drafts may be incomplete, but every value they do contain is bounded and exact-version. */
export function validateRubricScoreDraft(
  criteria: readonly RubricCriterion[],
  value: unknown,
): readonly RubricIssue[] {
  const issues = [...validateRubricCriteria(criteria)];
  if (issues.length) return issues;
  if (!Array.isArray(value))
    return [{ path: "scores", code: "required", message: "Criterion scores are required" }];
  if (value.length > criteria.length)
    issues.push({ path: "scores", code: "invalid", message: "Too many criterion scores" });
  const seen = new Set<string>();
  value.forEach((item: unknown, index: number) => {
    const path = `scores.${index}`;
    if (!isRecord(item)) {
      issues.push({ path, code: "invalid", message: "Score must be an object" });
      return;
    }
    if (Object.keys(item).some((key) => !["criterion_id", "value", "rationale"].includes(key)))
      issues.push({ path, code: "invalid", message: "Unknown score property" });
    const criterion = criteria.find((entry) => entry.id === item.criterion_id);
    if (!criterion) {
      issues.push({
        path: `${path}.criterion_id`,
        code: "unknown_criterion",
        message: "Score must reference this rubric version",
      });
      return;
    }
    if (seen.has(criterion.id))
      issues.push({
        path: `${path}.criterion_id`,
        code: "duplicate",
        message: "A criterion can be scored only once",
      });
    seen.add(criterion.id);
    if (
      typeof item.value !== "number" ||
      !Number.isInteger(item.value) ||
      item.value < 0 ||
      item.value > 5
    )
      issues.push({
        path: `${path}.value`,
        code: "invalid",
        message: "Score must be a whole number from 0 to 5",
      });
    if (typeof item.rationale !== "string" || item.rationale.length > 4000)
      issues.push({
        path: `${path}.rationale`,
        code: "invalid",
        message: "Rationale must be text up to 4000 characters",
      });
  });
  return issues;
}

/** A complete score is an integer number of tenths, from 0 to 1000 (display /10). */
export function calculateRubricScore(
  criteria: readonly RubricCriterion[],
  value: unknown,
): RubricScoreResult {
  const issues = [...validateRubricScoreDraft(criteria, value)];
  if (issues.length) return { ok: false, issues };
  if (!Array.isArray(value)) throw new Error("Validated score input must be an array");
  const seen = new Set<string>();
  let weighted = 0;
  value.forEach((item: unknown, index: number) => {
    const path = `scores.${index}`;
    if (!isRecord(item)) throw new Error("Validated score item must be an object");
    const criterion = criteria.find((entry) => entry.id === item.criterion_id);
    if (!criterion) throw new Error("Validated score must reference a criterion");
    seen.add(criterion.id);
    weighted += criterion.weight * (item.value as number);
    if (
      typeof item.rationale !== "string" ||
      item.rationale.trim().length < 1 ||
      item.rationale.length > 4000
    )
      issues.push({
        path: `${path}.rationale`,
        code: "required",
        message: "Every criterion requires a rationale (up to 4000 characters)",
      });
  });
  for (const criterion of criteria)
    if (!seen.has(criterion.id))
      issues.push({
        path: "scores",
        code: "required",
        message: `Missing score for criterion ${criterion.id}`,
      });
  return issues.length ? { ok: false, issues } : { ok: true, weighted_score_tenths: weighted * 2 };
}
