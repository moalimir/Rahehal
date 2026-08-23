// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChallengeList, useChallengeRecord } from "@/components/challenge-flow/hooks";
import type { ChallengeRecord } from "@/domain/challenge";
import type { ChallengeResult } from "@/lib/challenges/gateway";
import { emptyChallenge } from "@/lib/challenges/model";
import { demoChallengeGateway } from "@/lib/challenges/runtime";

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function success<Data>(data: Data): ChallengeResult<Data> {
  return {
    ok: true,
    data,
    meta: { server_time: "2026-08-23T12:00:00.000Z", correlation_id: "cor_test" },
  };
}

function storageFailure<Data>(): ChallengeResult<Data> {
  return {
    ok: false,
    error: { code: "STORAGE", message: "ذخیره انجام نشد" },
    meta: { server_time: "2026-08-23T12:00:00.000Z", correlation_id: "cor_test" },
  };
}

function record(id: string, title: string): ChallengeRecord {
  return { ...emptyChallenge(id, "2026-08-23T09:00:00.000Z"), title };
}

beforeEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

afterEach(() => cleanup());

describe("ترتیب queryهای challenge", () => {
  it("پاسخ قدیمی list نمی‌تواند پاسخ جدیدتر را بازنویسی کند", async () => {
    const first = deferred<ChallengeResult<ChallengeRecord[]>>();
    const second = deferred<ChallengeResult<ChallengeRecord[]>>();
    const list = vi
      .spyOn(demoChallengeGateway.queries, "list")
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const older = record("CH-DRAFT-001", "پاسخ قدیمی");
    const newer = record("CH-DRAFT-002", "پاسخ جدید");
    const { result } = renderHook(() => useChallengeList());
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1));

    act(() => window.dispatchEvent(new Event("storage")));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    await act(async () => {
      second.resolve(success([newer]));
      await second.promise;
    });
    expect(result.current.records.map(({ title }) => title)).toEqual(["پاسخ جدید"]);

    await act(async () => {
      first.resolve(success([older]));
      await first.promise;
    });
    expect(result.current.records.map(({ title }) => title)).toEqual(["پاسخ جدید"]);
    expect(result.current.loadError).toBe("");
  });
});

describe("ترتیب autosave challenge", () => {
  it("شکست save قدیمی، موفقیت snapshot جدیدتر را به error برنمی‌گرداند", async () => {
    const initial = record("CH-DRAFT-001", "نسخه پایه");
    vi.spyOn(demoChallengeGateway.queries, "get").mockResolvedValue(success(initial));
    const first = deferred<ChallengeResult<ChallengeRecord>>();
    const second = deferred<ChallengeResult<ChallengeRecord>>();
    vi.spyOn(demoChallengeGateway.commands, "save")
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const { result } = renderHook(() => useChallengeRecord(initial.id));
    await waitFor(() => expect(result.current.record?.id).toBe(initial.id));

    act(() => result.current.updateRecord((current) => ({ ...current, title: "نسخه اول" })));
    let firstSave!: Promise<ChallengeRecord | null>;
    act(() => {
      firstSave = result.current.saveNow();
    });
    act(() => result.current.updateRecord((current) => ({ ...current, title: "نسخه دوم" })));
    let secondSave!: Promise<ChallengeRecord | null>;
    act(() => {
      secondSave = result.current.saveNow();
    });
    const latest = { ...initial, title: "نسخه دوم", updatedAt: "2026-08-23T12:01:00.000Z" };

    await act(async () => {
      second.resolve(success(latest));
      await secondSave;
    });
    expect(result.current).toMatchObject({
      record: { title: "نسخه دوم" },
      saveStatus: "saved",
    });

    await act(async () => {
      first.resolve(storageFailure());
      await firstSave;
    });
    expect(result.current).toMatchObject({
      record: { title: "نسخه دوم" },
      saveStatus: "saved",
    });
  });

  it("موفقیت save قدیمی، شکست snapshot جدیدتر را پنهان نمی‌کند", async () => {
    const initial = record("CH-DRAFT-001", "نسخه پایه");
    vi.spyOn(demoChallengeGateway.queries, "get").mockResolvedValue(success(initial));
    const first = deferred<ChallengeResult<ChallengeRecord>>();
    const second = deferred<ChallengeResult<ChallengeRecord>>();
    vi.spyOn(demoChallengeGateway.commands, "save")
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const { result } = renderHook(() => useChallengeRecord(initial.id));
    await waitFor(() => expect(result.current.record?.id).toBe(initial.id));

    act(() => result.current.updateRecord((current) => ({ ...current, title: "نسخه اول" })));
    let firstSave!: Promise<ChallengeRecord | null>;
    act(() => {
      firstSave = result.current.saveNow();
    });
    act(() => result.current.updateRecord((current) => ({ ...current, title: "نسخه دوم" })));
    let secondSave!: Promise<ChallengeRecord | null>;
    act(() => {
      secondSave = result.current.saveNow();
    });

    await act(async () => {
      second.resolve(storageFailure());
      await secondSave;
    });
    expect(result.current).toMatchObject({
      record: { title: "نسخه دوم" },
      saveStatus: "error",
    });

    await act(async () => {
      first.resolve(success({ ...initial, title: "نسخه اول" }));
      await firstSave;
    });
    expect(result.current).toMatchObject({
      record: { title: "نسخه دوم" },
      saveStatus: "error",
    });
  });

  it("نتیجه save شناسه قبلی، state شناسه جدید را تغییر نمی‌دهد", async () => {
    const firstRecord = record("CH-DRAFT-001", "پرونده اول");
    const secondRecord = record("CH-DRAFT-002", "پرونده دوم");
    vi.spyOn(demoChallengeGateway.queries, "get").mockImplementation(async (id) =>
      success(id === firstRecord.id ? firstRecord : secondRecord),
    );
    const pendingSave = deferred<ChallengeResult<ChallengeRecord>>();
    vi.spyOn(demoChallengeGateway.commands, "save").mockImplementation(() => pendingSave.promise);
    const { result, rerender } = renderHook(({ id }) => useChallengeRecord(id), {
      initialProps: { id: firstRecord.id },
    });
    await waitFor(() => expect(result.current.record?.id).toBe(firstRecord.id));
    act(() => result.current.updateRecord((current) => ({ ...current, title: "ویرایش قدیمی" })));
    let save!: Promise<ChallengeRecord | null>;
    act(() => {
      save = result.current.saveNow();
    });

    rerender({ id: secondRecord.id });
    await waitFor(() => expect(result.current.record?.id).toBe(secondRecord.id));
    await act(async () => {
      pendingSave.resolve(storageFailure());
      await save;
    });
    expect(result.current).toMatchObject({
      record: { id: secondRecord.id, title: "پرونده دوم" },
      saveStatus: "saved",
      loadError: "",
    });
  });
});
