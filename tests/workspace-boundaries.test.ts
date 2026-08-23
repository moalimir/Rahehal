import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const boundaryScript = path.resolve(
  import.meta.dirname,
  "../scripts/check-workspace-boundaries.mjs",
);

describe("workspace boundary gate", () => {
  it("fails closed when expected workspace roots are absent", () => {
    const emptyRoot = mkdtempSync(path.join(tmpdir(), "rahhal-boundaries-"));

    try {
      const result = spawnSync(process.execPath, [boundaryScript, "--root", emptyRoot], {
        encoding: "utf8",
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("apps/api: missing package.json");
      expect(result.stderr).toContain("packages/contracts: missing package.json");
    } finally {
      rmSync(emptyRoot, { recursive: true });
    }
  });
});
