// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChallengeRecord } from "@/domain/challenge";
import { createLocalDemoChallengeGateway } from "@/lib/challenges/adapters/local-demo";
import { emptyChallenge } from "@/lib/challenges/model";

const gateway = createLocalDemoChallengeGateway();

beforeEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("ChallengeGateway نسخه نمایشی", () => {
  it("برای همه عملیات رکورد ناشناخته NOT_FOUND می‌دهد و fixture جایگزین نمی‌کند", async () => {
    const unknown = emptyChallenge("CH-UNKNOWN", "2026-08-23T09:00:00.000Z");
    const results = await Promise.all([
      gateway.queries.get(unknown.id),
      gateway.commands.save(unknown),
      gateway.commands.delete(unknown.id),
      gateway.commands.submit(unknown),
      gateway.commands.publish(unknown.id),
    ]);

    for (const result of results) {
      expect(result).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    }
    const listed = await gateway.queries.list();
    expect(listed.ok).toBe(true);
    if (!listed.ok) throw new Error(listed.error.message);
    expect(listed.data).toHaveLength(4);
    expect(listed.data.some((record) => record.id === unknown.id)).toBe(false);
  });

  it("رکوردهای structurally-invalid v9 را بدون throw رد و برای شناسه دقیق NOT_FOUND می‌کند", async () => {
    const base = emptyChallenge("CH-MALFORMED", "2026-08-23T09:00:00.000Z");
    const withoutId: Record<string, unknown> = { ...base };
    const withoutUpdatedAt: Record<string, unknown> = { ...base };
    delete withoutId.id;
    delete withoutUpdatedAt.updatedAt;
    window.localStorage.setItem(
      "rahhal.organization-challenges.v9",
      JSON.stringify({
        version: 9,
        updatedAt: new Date().toISOString(),
        records: [
          withoutId,
          { ...withoutUpdatedAt, id: "CH-MALFORMED-NO-DATE" },
          { ...base, id: "CH-MALFORMED-ARRAY", attachments: {} },
          {
            ...base,
            id: "CH-MALFORMED-ELIGIBILITY",
            allowedApplicantTypes: ["company", 42],
          },
        ],
      }),
    );

    await expect(gateway.queries.get(base.id)).resolves.toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
    const listed = await gateway.queries.list();
    expect(listed).toMatchObject({ ok: true });
    if (!listed.ok) throw new Error(listed.error.message);
    expect(listed.data).toHaveLength(4);
    expect(listed.data.some(({ id }) => id.startsWith("CH-MALFORMED"))).toBe(false);
  });

  it("رکوردهای structurally-invalid legacy را مهاجرت یا به eligibility مجاز تبدیل نمی‌کند", async () => {
    const first = {
      ...emptyChallenge("CH-MALFORMED-V8", "2026-08-23T09:00:00.000Z"),
      solverTypes: { team: true },
    } as Record<string, unknown>;
    const second = {
      ...emptyChallenge("CH-MALFORMED-V8-ARRAY", "2026-08-23T09:00:00.000Z"),
      solverTypes: ["team"],
      successCriteria: ["not-a-criterion"],
    } as Record<string, unknown>;
    delete first.allowedApplicantTypes;
    delete second.allowedApplicantTypes;
    window.localStorage.setItem(
      "rahhal.organization-challenges.v8",
      JSON.stringify({
        version: 8,
        updatedAt: new Date().toISOString(),
        records: [first, second],
      }),
    );

    const results = await Promise.all([
      gateway.queries.get("CH-MALFORMED-V8"),
      gateway.queries.get("CH-MALFORMED-V8-ARRAY"),
    ]);
    expect(results).toEqual([
      expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "NOT_FOUND" }) }),
      expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "NOT_FOUND" }) }),
    ]);
    const listed = await gateway.queries.list();
    if (!listed.ok) throw new Error(listed.error.message);
    expect(listed.data.some(({ id }) => id.startsWith("CH-MALFORMED"))).toBe(false);
  });

  it("رکورد موجود را از ذخیره تا ارسال و انتشار روی همان entity جلو می‌برد", async () => {
    const ready = await gateway.queries.get("CH-1405-052");
    if (!ready.ok) throw new Error(ready.error.message);
    const saved = await gateway.commands.save({
      ...ready.data,
      visibility: "public",
      sourcingModel: "public",
    });
    if (!saved.ok) throw new Error(saved.error.message);
    const submitted = await gateway.commands.submit(saved.data);
    expect(submitted).toMatchObject({ ok: true, data: { status: "under_review" } });
    if (!submitted.ok) throw new Error(submitted.error.message);
    const published = await gateway.commands.publish(submitted.data.id);
    expect(published).toMatchObject({
      ok: true,
      data: { id: submitted.data.id, status: "published" },
    });
  });

  it("ارسال snapshot قدیمی نمی‌تواند رکورد ارسال‌شده را بازنویسی کند", async () => {
    const ready = await gateway.queries.get("CH-1405-052");
    if (!ready.ok) throw new Error(ready.error.message);
    const staleDraft = {
      ...ready.data,
      status: "ready",
      sourcingModel: "public",
      visibility: "public",
    } satisfies ChallengeRecord;
    const submitted = await gateway.commands.submit(staleDraft);
    expect(submitted).toMatchObject({ ok: true, data: { status: "under_review" } });

    const repeated = await gateway.commands.submit(staleDraft);
    expect(repeated).toMatchObject({ ok: false, error: { code: "INVALID_STATE" } });
    const staleSave = await gateway.commands.save(staleDraft);
    expect(staleSave).toMatchObject({ ok: false, error: { code: "INVALID_STATE" } });
    const stored = await gateway.queries.get(staleDraft.id);
    expect(stored).toMatchObject({ ok: true, data: { status: "under_review" } });
  });

  it("خطای واقعی write را STORAGE می‌کند و رکورد ناشناخته نمی‌سازد", async () => {
    const existing = await gateway.queries.get("CH-1405-052");
    if (!existing.ok) throw new Error(existing.error.message);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });

    const result = await gateway.commands.save(existing.data);

    expect(result).toMatchObject({ ok: false, error: { code: "STORAGE" } });
  });

  it.each([
    {
      label: "mirror v8",
      failedKey: "rahhal.organization-challenges.v8",
      invalidatesMirror: true,
    },
    {
      label: "نشانگر تازگی mirror",
      failedKey: "rahhal.organization-challenges.v8.mirror-fresh",
      invalidatesMirror: true,
    },
    {
      label: "نشانگر seed",
      failedKey: "rahhal.organization-challenges.seeded.v9",
      invalidatesMirror: false,
    },
  ])(
    "شکست $label، write موفق v9 را ناموفق اعلام نمی‌کند",
    async ({ failedKey, invalidatesMirror }) => {
      const existing = await gateway.queries.get("CH-1405-052");
      if (!existing.ok) throw new Error(existing.error.message);
      const originalSetItem = Storage.prototype.setItem;
      const setItemSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
        this: Storage,
        key,
        value,
      ) {
        if (key === failedKey) {
          throw new DOMException("Quota exceeded", "QuotaExceededError");
        }
        originalSetItem.call(this, key, value);
      });
      const changedTitle = `عنوان ذخیره‌شده با v9 - ${failedKey}`;

      const saved = await gateway.commands.save({ ...existing.data, title: changedTitle });

      expect(saved).toMatchObject({ ok: true, data: { title: changedTitle } });
      const current = await gateway.queries.get(existing.data.id);
      expect(current).toMatchObject({ ok: true, data: { title: changedTitle } });
      const currentEnvelope = JSON.parse(
        window.localStorage.getItem("rahhal.organization-challenges.v9") ?? "null",
      ) as { records?: ChallengeRecord[] } | null;
      expect(currentEnvelope?.records?.find(({ id }) => id === existing.data.id)?.title).toBe(
        changedTitle,
      );
      if (invalidatesMirror) {
        expect(window.localStorage.getItem("rahhal.organization-challenges.v8")).toBeNull();
        expect(
          window.localStorage.getItem("rahhal.organization-challenges.v8.mirror-fresh"),
        ).toBeNull();
        setItemSpy.mockRestore();
        window.localStorage.setItem("rahhal.organization-challenges.v9", "{corrupt-current");
        const recovered = await gateway.queries.get(existing.data.id);
        expect(recovered).not.toMatchObject({ ok: true, data: { title: changedTitle } });
      }
    },
  );

  it("پس از خرابی v9 حاضر، v6 قدیمی را به‌عنوان بازیابی زنده نمی‌کند", async () => {
    const legacy = {
      ...emptyChallenge("CH-DRAFT-001", "2026-08-20T10:00:00.000Z"),
      title: "عنوان قدیمی v6",
    };
    window.localStorage.setItem("rahhal.organization-challenges.v6", JSON.stringify([legacy]));
    const migrated = await gateway.queries.get(legacy.id);
    expect(migrated).toMatchObject({ ok: true, data: { title: "عنوان قدیمی v6" } });
    if (!migrated.ok) throw new Error(migrated.error.message);

    const updated = await gateway.commands.save({
      ...migrated.data,
      title: "عنوان جدید authoritative v9",
      allowedApplicantTypes: ["lab"],
    });

    expect(updated).toMatchObject({ ok: true, data: { title: "عنوان جدید authoritative v9" } });
    expect(window.localStorage.getItem("rahhal.organization-challenges.v8")).toBeNull();
    window.localStorage.setItem("rahhal.organization-challenges.v6", JSON.stringify([legacy]));
    window.localStorage.setItem("rahhal.organization-challenges.v9", "{corrupt-current");
    const recovered = await gateway.queries.get(legacy.id);
    expect(recovered).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    const listed = await gateway.queries.list();
    if (!listed.ok) throw new Error(listed.error.message);
    expect(listed.data.some((record) => record.title === "عنوان قدیمی v6")).toBe(false);
  });

  it("خطای برنامه‌نویسی نامرتبط را به STORAGE تبدیل نمی‌کند", async () => {
    const existing = await gateway.queries.get("CH-1405-052");
    if (!existing.ok) throw new Error(existing.error.message);
    vi.spyOn(window, "dispatchEvent").mockImplementation(() => {
      throw new Error("Unexpected event failure");
    });

    await expect(gateway.commands.save(existing.data)).rejects.toThrow("Unexpected event failure");
  });
});
