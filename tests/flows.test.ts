import { describe, expect, it } from "vitest";

import { endToEndFlows, flowCoverage, negativeFlows } from "@/data/flow-coverage";
import { internalRoutes } from "@/data/internal-routes";

describe("PRD flow coverage", () => {
  it("maps all 15 end-to-end and 10 negative scenarios", () => {
    expect(endToEndFlows).toHaveLength(15);
    expect(negativeFlows).toHaveLength(10);
    expect(new Set(flowCoverage.map((flow) => flow.id)).size).toBe(25);
  });

  it("maps every flow to generated product routes", () => {
    const routePaths = new Set(internalRoutes.map((route) => route.path));

    for (const flow of flowCoverage) {
      expect(flow.routes.length, `${flow.id} must have a route`).toBeGreaterThan(0);
      expect(flow.proof.length, `${flow.id} must explain its proof`).toBeGreaterThan(10);
      for (const path of flow.routes)
        expect(routePaths.has(path), `${flow.id}: ${path}`).toBe(true);
    }
  });
});
