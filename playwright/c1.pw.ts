import { expect, test, type Page } from "@playwright/test";

/**
 * C1 acceptance ([80] §6): drives the authoritative solver profile,
 * verification, and eligibility surface through the real connected boundary —
 * Dex session, cookie transport, Fastify authorization, PostgreSQL — rather
 * than through a directly constructed adapter, which is where the route
 * guards and the workspace context contract actually live.
 *
 * Requires the connected stack (PostgreSQL, API in `postgres` mode, local Dex,
 * and the web built with RAHHAL_WEB_RUNTIME=network):
 *
 *   RAHHAL_CONNECTED_E2E=1 npm run test:browser:c1
 *
 * The connected database is long-lived, so nothing here assumes a pristine
 * row: the individual workspace carries the mutations and the team workspace
 * stays untouched as the "seeded and therefore not ready" reference.
 *
 * Identities are the repository's synthetic local fixtures; `@synthetic.invalid`
 * is a reserved, unroutable domain and the shared password lives in
 * infra/local/dex/config.yaml. Nothing here is a real credential.
 */
const connectedStack = process.env.RAHHAL_CONNECTED_E2E === "1";
const password = process.env.RAHHAL_E2E_PASSWORD ?? "rahhal-local-owner";

const solver = "solver-alpha@synthetic.invalid";
const individualWorkspaceId = "wsp_individual_alpha";
const teamWorkspaceId = "wsp_team_alpha";
const orgWorkspaceId = "wsp_org_alpha";

type ApiResult = { status: number; body: Record<string, unknown> };

async function api(
  page: Page,
  method: string,
  path: string,
  body: unknown,
  workspaceId: string,
  idempotencyKey?: string,
): Promise<ApiResult> {
  return page.evaluate(
    async ([method, path, body, workspaceId, key]) => {
      const response = await fetch(path as string, {
        method: method as string,
        credentials: "same-origin",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "x-workspace-id": workspaceId as string,
          "idempotency-key":
            (key as string) || `c1-${Math.random().toString(36).slice(2)}-${Date.now()}`,
        },
        ...(body === null ? {} : { body: JSON.stringify(body) }),
      });
      return { status: response.status, body: await response.json() };
    },
    [method, path, body ?? null, workspaceId, idempotencyKey ?? ""] as const,
  );
}

function data(result: ApiResult): Record<string, unknown> {
  return (result.body as { data: Record<string, unknown> }).data;
}

async function signIn(page: Page, email: string) {
  await page.goto("/auth/organization/login");
  await page.getByRole("button", { name: /ادامه برای ورود امن سازمانی/ }).click();
  await page.waitForURL(/\/dex\/auth/);
  await page.locator("#login").fill(email);
  await page.locator("#password").fill(password);
  await page.locator("#submit-login").click();
  await page.waitForURL(/localhost:3000/);
}

/**
 * A freshly exchanged session carries no active workspace, and every route
 * refuses a header that does not match it. The connected UI only offers an
 * organization chooser, so the solver activates its workspace through the
 * server command directly.
 */
async function activate(page: Page, workspaceId: string): Promise<void> {
  const me = await page.evaluate(async () => {
    const response = await fetch("/api/v1/me", {
      credentials: "same-origin",
      headers: { accept: "application/json" },
    });
    return response.json();
  });
  const version = (me as { meta: { entity_version: number } }).meta.entity_version;
  const switched = await api(
    page,
    "POST",
    "/api/v1/me/context:switch",
    { expected_version: version, workspace_id: workspaceId },
    workspaceId,
  );
  expect(switched.status).toBe(200);
}

test.describe("C1 connected solver eligibility", () => {
  test.skip(!connectedStack, "requires the connected stack (RAHHAL_CONNECTED_E2E=1)");
  test.describe.configure({ mode: "serial", timeout: 180_000 });

  test("derives profile readiness on the server and versions every write", async ({ page }) => {
    await signIn(page, solver);

    // Readiness is computed from stored facts, never asserted by the caller:
    // the untouched seeded team profile carries no facts and is not ready.
    await activate(page, teamWorkspaceId);
    const seeded = data(await api(page, "GET", "/api/v1/solver/profile", null, teamWorkspaceId));
    expect(seeded.applicant_type).toBe("expert-team");
    expect((seeded.readiness as { ready: boolean }).ready).toBe(false);
    expect((seeded.readiness as { issues: unknown[] }).issues.length).toBeGreaterThan(0);

    await activate(page, individualWorkspaceId);
    const before = await api(page, "GET", "/api/v1/solver/profile", null, individualWorkspaceId);
    expect(before.status).toBe(200);
    const profile = data(before);
    expect(profile.workspace_id).toBe(individualWorkspaceId);
    expect(profile.applicant_type).toBe("individual");
    const version = profile.version as number;

    const patch = await api(
      page,
      "PATCH",
      "/api/v1/solver/profile",
      {
        expected_version: version,
        patch: {
          headline: "متخصص پایش صنعتی",
          overview: "طراحی و اجرای سامانه‌های پایش مصرف آب در خطوط تولید صنعتی.",
          expertise: ["پایش صنعتی", "مکانیک"],
          geography: ["تهران"],
        },
      },
      individualWorkspaceId,
    );
    expect(patch.status).toBe(200);

    const after = data(
      await api(page, "GET", "/api/v1/solver/profile", null, individualWorkspaceId),
    );
    expect((after.readiness as { ready: boolean }).ready).toBe(true);
    expect(after.version).toBe(version + 1);
    expect(after.applicant_type).toBe("individual");

    // A second write against the consumed version must be refused.
    const stale = await api(
      page,
      "PATCH",
      "/api/v1/solver/profile",
      { expected_version: version, patch: { headline: "عنوان تازه" } },
      individualWorkspaceId,
    );
    expect(stale.status).toBe(409);
  });

  test("owns verification state and replays a duplicate start exactly once", async ({ page }) => {
    await signIn(page, solver);
    await activate(page, individualWorkspaceId);

    const current = data(
      await api(page, "GET", "/api/v1/solver/verification", null, individualWorkspaceId),
    );
    expect(current.workspace_id).toBe(individualWorkspaceId);

    if (current.state === "not_started") {
      const key = `c1-start-${Date.now()}`;
      const body = { expected_version: current.version };
      const started = await api(
        page,
        "POST",
        "/api/v1/solver/verification:start",
        body,
        individualWorkspaceId,
        key,
      );
      expect(started.status).toBe(200);
      const replay = await api(
        page,
        "POST",
        "/api/v1/solver/verification:start",
        body,
        individualWorkspaceId,
        key,
      );
      expect(replay.status).toBe(200);
      expect(data(started).idempotent).toBe(false);
      expect(data(replay)).toEqual({ ...data(started), idempotent: true });
    }

    const started = data(
      await api(page, "GET", "/api/v1/solver/verification", null, individualWorkspaceId),
    );
    expect(started.state).toBe("draft");
    expect(started.requested_at).not.toBeNull();
    // Verified is never something a started request can claim for itself.
    expect(started.verified_at).toBeNull();

    // Starting again from a non-`not_started` state is a typed conflict.
    const again = await api(
      page,
      "POST",
      "/api/v1/solver/verification:start",
      { expected_version: started.version },
      individualWorkspaceId,
    );
    expect(again.status).toBe(409);
  });

  test("denies cross-workspace and unknown records without enumerating them", async ({ page }) => {
    await signIn(page, solver);
    await activate(page, individualWorkspaceId);

    // The solver holds no membership in the organization workspace, and the
    // active context is the individual one either way.
    const foreign = await api(page, "GET", "/api/v1/solver/profile", null, orgWorkspaceId);
    expect(foreign.status).toBe(404);
    expect(JSON.stringify(foreign.body)).not.toContain(orgWorkspaceId);

    const unknownChallenge = await api(
      page,
      "GET",
      "/api/v1/challenges/chl_00000000000000000000000000000000/eligibility",
      null,
      individualWorkspaceId,
    );
    expect(unknownChallenge.status).toBe(404);
  });

  test("evaluates eligibility from server state for both solver workspaces", async ({ page }) => {
    await signIn(page, solver);
    await activate(page, individualWorkspaceId);

    const published = await page.evaluate(async () => {
      const response = await fetch("/api/v1/public/challenges", {
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });
      return response.json();
    });
    const items = (published as { data: { items: { challenge_id: string }[] } }).data.items;
    expect(items.length).toBeGreaterThan(0);
    const challengeId = items[0]!.challenge_id;

    for (const workspaceId of [individualWorkspaceId, teamWorkspaceId]) {
      await activate(page, workspaceId);
      const decision = await api(
        page,
        "GET",
        `/api/v1/challenges/${challengeId}/eligibility`,
        null,
        workspaceId,
      );
      expect(decision.status).toBe(200);
      const evaluated = data(decision);
      expect(evaluated.challenge_id).toBe(challengeId);
      expect(typeof evaluated.evaluated_against_version_id).toBe("string");
      expect(["eligible", "needs_action", "ineligible"]).toContain(evaluated.status);
    }
  });
});
