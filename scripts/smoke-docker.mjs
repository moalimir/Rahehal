import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";

const requestTimeoutMs = 5_000;
const execFileAsync = promisify(execFile);

function localUrl(name, explicitUrl, port, path = "/") {
  const value = explicitUrl?.trim();
  if (value) return new URL(path, value).toString();
  return new URL(path, `http://127.0.0.1:${port}`).toString();
}

async function checkedResponse(name, url, init) {
  let response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(requestTimeoutMs) });
  } catch (error) {
    throw new Error(`${name} is unavailable at ${url}: ${error.message}`, { cause: error });
  }
  if (!response.ok) {
    throw new Error(`${name} returned HTTP ${response.status} at ${url}`);
  }
  return response;
}

const webUrl = localUrl("web", process.env.RAHHAL_WEB_URL, process.env.RAHHAL_WEB_PORT ?? "3000");
const webRouteUrl = localUrl(
  "web",
  process.env.RAHHAL_WEB_URL,
  process.env.RAHHAL_WEB_PORT ?? "3000",
  "/challenges",
);
const apiUrl = localUrl(
  "api",
  process.env.RAHHAL_API_URL,
  process.env.RAHHAL_API_PORT ?? "3001",
  "/api/v1/openapi.json",
);
const apiOrigin = new URL(
  process.env.RAHHAL_API_URL?.trim() || `http://127.0.0.1:${process.env.RAHHAL_API_PORT ?? "3001"}`,
);

const web = await checkedResponse("Rahhal web container", webUrl);
const html = await web.text();
if (!html.includes('<html lang="fa" dir="rtl"')) {
  throw new Error("Rahhal web container did not return the expected Persian RTL export");
}

const webRoute = await checkedResponse("Rahhal web deep route", webRouteUrl);
if (new URL(webRoute.url).origin !== new URL(webUrl).origin) {
  throw new Error(`Rahhal web deep route escaped the published origin: ${webRoute.url}`);
}

const api = await checkedResponse("Rahhal API container", apiUrl);
const specification = await api.json();
if (specification.openapi !== "3.1.0" || specification.info?.title !== "Rahhal API") {
  throw new Error("Rahhal API container did not return the canonical OpenAPI document");
}

const commandHeaders = {
  authorization: "Bearer local-a1b-access-owner-alpha",
  "content-type": "application/json",
  "x-workspace-id": "wsp_org_alpha",
  "idempotency-key": `docker-smoke-${randomUUID()}`,
};
const create = await checkedResponse(
  "Rahhal PostgreSQL challenge create",
  new URL("/api/v1/challenges", apiOrigin),
  {
    method: "POST",
    headers: commandHeaders,
    body: JSON.stringify({
      expected_version: 0,
      draft: { title: "Docker restart persistence smoke" },
    }),
  },
);
const created = await create.json();
const challengeId = created?.data?.entity_id;
if (typeof challengeId !== "string" || !challengeId.startsWith("chl_")) {
  throw new Error("Rahhal PostgreSQL challenge create did not return a typed challenge receipt");
}

await execFileAsync("docker", ["compose", "restart", "api"], { timeout: 60_000 });

let readAfterRestart;
for (let attempt = 0; attempt < 30; attempt += 1) {
  try {
    readAfterRestart = await checkedResponse(
      "Rahhal PostgreSQL challenge after API restart",
      new URL(`/api/v1/challenges/${challengeId}`, apiOrigin),
      {
        headers: {
          authorization: commandHeaders.authorization,
          "x-workspace-id": commandHeaders["x-workspace-id"],
        },
      },
    );
    break;
  } catch (error) {
    if (attempt === 29) throw error;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}
const persisted = await readAfterRestart.json();
if (
  persisted?.data?.id !== challengeId ||
  persisted?.data?.content?.title !== "Docker restart persistence smoke"
) {
  throw new Error("Rahhal challenge did not persist across the API container restart");
}

process.stdout.write(
  `Docker smoke passed with PostgreSQL restart persistence: web=${webUrl} api=${apiUrl} challenge=${challengeId}\n`,
);
