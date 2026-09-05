import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { access, readFile, writeFile } from "node:fs/promises";

const target = new URL("../.env", import.meta.url);
const example = new URL("../.env.example", import.meta.url);

try {
  await access(target, constants.F_OK);
  throw new Error(
    ".env already exists; add the required local secret values there without replacing it",
  );
} catch (error) {
  if (error instanceof Error && error.message.startsWith(".env already exists")) throw error;
}

const secret = () => randomBytes(48).toString("base64url");
const template = await readFile(example, "utf8");
const content = template
  .replace(/^RAHHAL_OIDC_FLOW_SECRET=$/m, `RAHHAL_OIDC_FLOW_SECRET=${secret()}`)
  .replace(/^RAHHAL_SESSION_CREDENTIAL_SECRET=$/m, `RAHHAL_SESSION_CREDENTIAL_SECRET=${secret()}`)
  .replace(/^SOLVER_OTP_FLOW_SECRET=$/m, `SOLVER_OTP_FLOW_SECRET=${secret()}`);

await writeFile(target, content, { encoding: "utf8", flag: "wx", mode: 0o600 });
process.stdout.write("Created an uncommitted mode-0600 .env with independent local secrets.\n");
