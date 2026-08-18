import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  oxc: { jsx: { runtime: "automatic" } },
  test: { environment: "node", globals: true, pool: "forks", fileParallelism: false },
  resolve: { alias: { "@": path.resolve(import.meta.dirname, ".") } },
});
