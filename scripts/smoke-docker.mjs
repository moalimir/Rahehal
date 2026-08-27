const requestTimeoutMs = 5_000;

function localUrl(name, explicitUrl, port, path = "/") {
  const value = explicitUrl?.trim();
  if (value) return new URL(path, value).toString();
  return new URL(path, `http://127.0.0.1:${port}`).toString();
}

async function checkedResponse(name, url) {
  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(requestTimeoutMs) });
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

process.stdout.write(`Docker smoke passed: web=${webUrl} api=${apiUrl}\n`);
