import { configDefaults, defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "node",
    globals: true,
    pool: "forks",
    fileParallelism: false,
    exclude: [...configDefaults.exclude, "apps/api/test/postgres-*.test.ts"],
  },
  resolve: { alias: { "@": path.resolve(import.meta.dirname, ".") } },
});
