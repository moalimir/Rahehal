// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChallengeDetail } from "@/components/challenge-discovery/challenge-detail";
import { ChallengeDirectory } from "@/components/challenge-discovery/challenge-directory";
import { challenges } from "@/data/mock";
import type { OpportunityResult, OpportunityView } from "@/lib/challenges/public-catalog";
import { demoOpportunityGateway } from "@/lib/challenges/runtime";

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function success(data: OpportunityView[]): OpportunityResult<OpportunityView[]> {
  return {
    ok: true,
    data,
    meta: { server_time: "2026-08-23T12:00:00.000Z", correlation_id: "cor_test" },
  };
}

function detailSuccess(data: OpportunityView): OpportunityResult<OpportunityView> {
  return {
    ok: true,
    data,
    meta: { server_time: "2026-08-23T12:00:00.000Z", correlation_id: "cor_test" },
  };
}

function storageFailure(): OpportunityResult<OpportunityView[]> {
  return {
    ok: false,
    error: { code: "STORAGE", message: "فهرست فرصت‌ها در دسترس نیست" },
    meta: { server_time: "2026-08-23T12:00:00.000Z", correlation_id: "cor_test" },
  };
}

function opportunity(title: string): OpportunityView {
  return { ...challenges[0], title, tags: [...challenges[0].tags] };
}

beforeEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  window.history.replaceState({}, "", "/challenges");
});

afterEach(() => cleanup());

describe("فهرست فرصت‌های عمومی", () => {
  it("پاسخ قدیمی refresh نمی‌تواند projection جدیدتر را بازنویسی کند", async () => {
    const first = deferred<OpportunityResult<OpportunityView[]>>();
    const second = deferred<OpportunityResult<OpportunityView[]>>();
    const list = vi
      .spyOn(demoOpportunityGateway.queries, "list")
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    render(
      <ChallengeDirectory basePath="/challenges" contextQuery="" workspaceId="WS-PERSONAL-001" />,
    );
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1));

    act(() => window.dispatchEvent(new CustomEvent("rahhal:challenges")));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    await act(async () => {
      second.resolve(success([opportunity("projection جدید")]));
      await second.promise;
    });
    expect(await screen.findByText("projection جدید")).toBeInTheDocument();

    await act(async () => {
      first.resolve(success([opportunity("projection قدیمی")]));
      await first.promise;
    });
    expect(screen.getByText("projection جدید")).toBeInTheDocument();
    expect(screen.queryByText("projection قدیمی")).not.toBeInTheDocument();
  });

  it("در خطای query هیچ کارت fixture یا اقدام stale نمایش نمی‌دهد", async () => {
    vi.spyOn(demoOpportunityGateway.queries, "list").mockResolvedValue(storageFailure());
    render(
      <ChallengeDirectory basePath="/challenges" contextQuery="" workspaceId="WS-PERSONAL-001" />,
    );

    expect(
      await screen.findByRole("heading", { name: "فرصت‌ها در دسترس نیستند" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(challenges[0].title)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /مشاهده/ })).not.toBeInTheDocument();
  });

  it("پاسخ قدیمی refresh جزئیات نمی‌تواند projection جدیدتر را بازنویسی کند", async () => {
    const first = deferred<OpportunityResult<OpportunityView>>();
    const second = deferred<OpportunityResult<OpportunityView>>();
    const get = vi
      .spyOn(demoOpportunityGateway.queries, "get")
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    render(
      <ChallengeDetail
        challengeKey={challenges[0].id}
        basePath="/challenges"
        activeContext={{ type: "individual", workspaceId: "WS-PERSONAL-001" }}
        contextQuery=""
      />,
    );
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));

    act(() => window.dispatchEvent(new CustomEvent("rahhal:challenges")));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    await act(async () => {
      second.resolve(detailSuccess(opportunity("جزئیات جدید")));
      await second.promise;
    });
    expect(
      await screen.findByRole("heading", { level: 1, name: "جزئیات جدید" }),
    ).toBeInTheDocument();

    await act(async () => {
      first.resolve(detailSuccess(opportunity("جزئیات قدیمی")));
      await first.promise;
    });
    expect(screen.getByRole("heading", { level: 1, name: "جزئیات جدید" })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { level: 1, name: "جزئیات قدیمی" }),
    ).not.toBeInTheDocument();
  });
});
