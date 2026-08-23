// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalDemoChallengeGateway } from "@/lib/challenges/adapters/local-demo";
import { createLocalDemoOpportunityGateway } from "@/lib/challenges/adapters/local-demo-opportunities";

const challengeGateway = createLocalDemoChallengeGateway();
const opportunityGateway = createLocalDemoOpportunityGateway();

beforeEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("OpportunityGateway نسخه نمایشی", () => {
  it("fixture ثابت را نیز با projection صریح و بدون کلید اضافی برمی‌گرداند", async () => {
    const projected = await opportunityGateway.queries.get("CH-1405-022");

    expect(projected.ok).toBe(true);
    if (!projected.ok) throw new Error(projected.error.message);
    expect(Object.keys(projected.data).sort()).toEqual(
      [
        "budget",
        "deadline",
        "fit",
        "id",
        "industry",
        "organizationId",
        "publisherPublishedCount",
        "route",
        "slug",
        "status",
        "tags",
        "title",
        "visibility",
      ].sort(),
    );
  });

  it("فقط projection عمومی allowlist‌شده را برمی‌گرداند", async () => {
    const ready = await challengeGateway.queries.get("CH-1405-052");
    if (!ready.ok) throw new Error(ready.error.message);
    const beforePublication = await opportunityGateway.queries.get(ready.data.id);
    expect(beforePublication).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    const saved = await challengeGateway.commands.save({
      ...ready.data,
      visibility: "public",
      sourcingModel: "public",
    });
    if (!saved.ok) throw new Error(saved.error.message);
    const submitted = await challengeGateway.commands.submit(saved.data);
    if (!submitted.ok) throw new Error(submitted.error.message);
    const published = await challengeGateway.commands.publish(submitted.data.id);
    if (!published.ok) throw new Error(published.error.message);

    const projected = await opportunityGateway.queries.get(published.data.id);

    expect(projected).toMatchObject({
      ok: true,
      data: { id: published.data.id, title: published.data.title },
    });
    if (!projected.ok) throw new Error(projected.error.message);
    expect(Object.keys(projected.data).sort()).toEqual(
      [
        "budget",
        "deadline",
        "fit",
        "id",
        "industry",
        "organizationId",
        "publisherPublishedCount",
        "route",
        "slug",
        "status",
        "tags",
        "title",
        "visibility",
      ].sort(),
    );
    expect(projected.data).not.toHaveProperty("attachments");
    expect(projected.data).not.toHaveProperty("contactEmail");
    expect(projected.data).not.toHaveProperty("invitees");
    expect(projected.data).not.toHaveProperty("legalNotes");
  });

  it("شناسه ناشناخته را بدون fixture جایگزین NOT_FOUND می‌کند", async () => {
    const result = await opportunityGateway.queries.get("CH-UNKNOWN");
    expect(result).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });

  it("خطای storage را به envelope تایپ‌شده تبدیل می‌کند", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Storage blocked", "SecurityError");
    });
    const result = await opportunityGateway.queries.list();
    expect(result).toMatchObject({ ok: false, error: { code: "STORAGE" } });
  });
});
