import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@rahhal/contracts": fileURLToPath(new URL("../contracts/src/index.ts", import.meta.url)),
      "@rahhal/domain": fileURLToPath(new URL("../domain/src/index.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
