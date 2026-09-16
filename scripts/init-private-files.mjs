import { randomBytes } from "node:crypto";
import { appendFile, readFile } from "node:fs/promises";

// Add one independent local secret without printing or replacing existing keys.
const target = new URL("../.env", import.meta.url);
const existing = await readFile(target, "utf8");
if (/^RAHHAL_FILE_SIGNING_SECRET=.+$/m.test(existing)) {
  process.stdout.write("Private file signing secret already configured; unchanged.\n");
} else if (/^RAHHAL_FILE_SIGNING_SECRET=/m.test(existing)) {
  throw new Error(
    "An empty file signing secret exists; configure it in .env before starting Docker.",
  );
} else {
  await appendFile(
    target,
    `\nRAHHAL_FILE_SIGNING_SECRET=${randomBytes(48).toString("base64url")}\n`,
    { mode: 0o600 },
  );
  process.stdout.write(
    "Added independent private-file signing secret to local .env; existing settings preserved.\n",
  );
}
