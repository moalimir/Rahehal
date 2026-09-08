import { describe, expect, it } from "vitest";
import {
  calculateRubricScore,
  validateRubricCriteria,
  type RubricCriterion,
} from "../src/rubric.js";

const criteria: readonly RubricCriterion[] = [
  { id: "feasibility", label: "امکان‌پذیری", weight: 60, min: 0, max: 5 },
  { id: "impact", label: "اثر مورد انتظار", weight: 40, min: 0, max: 5 },
];
const scores = [
  { criterion_id: "feasibility", value: 4, rationale: "شواهد فنی کافی ارائه شده است." },
  { criterion_id: "impact", value: 3, rationale: "اثر نیازمند اعتبارسنجی در پایلوت است." },
];
describe("DEC-2026-019 rubric policy", () => {
  it("calculates a weighted result exactly and independently of criterion order", () => {
    expect(validateRubricCriteria(criteria)).toEqual([]);
    expect(calculateRubricScore(criteria, scores)).toEqual({
      ok: true,
      weighted_score_tenths: 720,
    });
    expect(calculateRubricScore([...criteria].reverse(), [...scores].reverse())).toEqual({
      ok: true,
      weighted_score_tenths: 720,
    });
    for (const value of [0, 5])
      expect(
        calculateRubricScore(
          criteria,
          scores.map((score) => ({ ...score, value })),
        ),
      ).toEqual({ ok: true, weighted_score_tenths: value * 200 });
  });
  it("rejects duplicate IDs, bad labels, weights, ranges and unknown fields", () => {
    for (const patch of [
      { id: "impact" },
      { id: "../impact" },
      { label: "  " },
      { weight: 59 },
      { weight: 60.5 },
      { weight: 0 },
      { max: 10 },
      { min: -1 },
      { secret: "unexpected" },
    ])
      expect(validateRubricCriteria([{ ...criteria[0], ...patch }, criteria[1]])).not.toEqual([]);
    for (const invalid of [null, [], Array.from({ length: 21 }, () => criteria[0])])
      expect(validateRubricCriteria(invalid)).not.toEqual([]);
  });
  it("never computes a submitted result from missing, duplicate or foreign-version scores", () => {
    for (const invalid of [
      null,
      [],
      scores.slice(0, 1),
      [...scores, scores[0]],
      [scores[0], { ...scores[1], criterion_id: "foreign_version" }],
    ])
      expect(calculateRubricScore(criteria, invalid).ok).toBe(false);
  });
  it("requires bounded integer scores and rationale for every criterion", () => {
    for (const patch of [
      { value: -1 },
      { value: 6 },
      { value: 3.5 },
      { value: NaN },
      { value: "4" },
      { rationale: " " },
      { rationale: "x".repeat(4001) },
      { identity: "unexpected" },
    ])
      expect(calculateRubricScore(criteria, [{ ...scores[0], ...patch }, scores[1]]).ok).toBe(
        false,
      );
  });
});
