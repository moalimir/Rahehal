import { spawnSync } from "node:child_process";
import path from "node:path";

const nextCli = path.resolve("node_modules/next/dist/bin/next");
const result = spawnSync(process.execPath, [nextCli, "build", "--webpack"], {
  stdio: "inherit",
  env: { ...process.env, ANALYZE: "true" },
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
