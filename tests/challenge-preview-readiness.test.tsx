// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChallengeReadinessIssue } from "@rahhal/domain";
import type { ChallengeGateway, ChallengeResult } from "@/lib/challenges/gateway";
import { emptyChallenge } from "@/lib/challenges/model";
import { validateRecord } from "@/lib/challenges/validation";

/**
 * B1's acceptance claims draft, preview and submit report *identical*
 * field-level errors for the same content. The draft-read/submit half is
 * proven server-side in `apps/api/test/api.test.ts`. This is the preview leg:
 * when the server has spoken, the preview must render the server's issues and
 * must not fall back to the browser's own validator, which is a second
 * implementation of the same rules and would drift.
 */
const record = emptyChallenge("chl_b1_preview_00001", "2026-08-30T09:00:00.000Z");

// Deliberately unlike anything `validateRecord` produces, so a fallback to the
// local validator is visible rather than coincidentally matching.
const serverIssues: readonly ChallengeReadinessIssue[] = [
  { path: "/content/title", code: "min_length", message: "پیام سرور برای عنوان", step: 1 },
  { path: "/content/in_scope", code: "required", message: "پیام سرور برای دامنه", step: 2 },
];

const gateway = {
  queries: {
    async list(): Promise<ChallengeResult<never>> {
      throw new Error("unused");
    },
    async get(): Promise<ChallengeResult<typeof record>> {
      return {
        ok: true,
        data: record,
        meta: {
          server_time: "2026-08-30T09:00:00.000Z",
          correlation_id: "cor_b1_preview",
          readiness: { ready: false, evaluated_version: 1, issues: serverIssues },
          stage: "draft",
        },
      };
    },
  },
  commands: {},
} as unknown as ChallengeGateway;

vi.mock("@/components/runtime-provider", () => ({
  useChallengeGateway: () => gateway,
  useChallengeGovernance: () => null,
  useWebRuntime: () => ({ mode: "network", me: null, sessionStatus: "authenticated" }),
}));

afterEach(cleanup);

describe("B1 readiness contract across draft, preview and submit", () => {
  it("renders the server's readiness issues in preview, not the browser validator's", async () => {
    const { ChallengePreviewPage } = await import("@/components/challenge-flow/preview-page");
    render(<ChallengePreviewPage id={record.id} />);

    for (const issue of serverIssues) {
      expect(await screen.findByText(issue.message)).toBeTruthy();
    }

    // The local validator has opinions about this same empty record. None of
    // its messages may appear, or preview and submit would disagree.
    const localOnly = validateRecord(record)
      .map((issue) => issue.message)
      .filter((message) => !serverIssues.some((issue) => issue.message === message));
    expect(localOnly.length).toBeGreaterThan(0);
    await waitFor(() => {
      for (const message of localOnly) {
        expect(screen.queryByText(message)).toBeNull();
      }
    });
  });
});
