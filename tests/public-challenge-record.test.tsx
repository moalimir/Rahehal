/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChallengePublicProjectionResource } from "@rahhal/contracts";
import {
  parseChallengeId,
  parseChallengeVersionId,
  type ChallengePublicationState,
} from "@rahhal/domain";

import { PublicChallengeRecord } from "@/components/public-challenge-record";

const projection = {
  challenge_id: parseChallengeId("chl_public_record_001"),
  challenge_version_id: parseChallengeVersionId("chv_public_record_001"),
  title: "کاهش مصرف بخار",
  category: "energy",
  location: "کارخانه شماره یک",
  public_summary: "فراخوان عمومی برای کاهش مصرف بخار.",
  output_type: "pilot",
  sourcing_model: "public",
  applicant_scope: "both",
  allowed_applicant_types: ["individual", "expert-team"],
  work_mode: "hybrid",
  proposal_deadline: "2030-06-01T20:29:59.999Z",
  preferred_start_date: null,
  budget: { status: "fixed", amount_minor: 1_000_000, currency: "IRR" },
  visibility: "public",
  verification_required: false,
  nda_required: false,
  document_gate_required: false,
  ip_terms: "solver_license",
  state: "open",
  published_at: "2026-08-30T10:00:00.000Z",
} as const satisfies ChallengePublicProjectionResource;

function stubFetch(state: ChallengePublicationState) {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            ok: true,
            data: { ...projection, state },
            meta: {
              server_time: "2026-08-31T10:00:00.000Z",
              correlation_id: "cor_public_record",
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    ),
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("public challenge record", () => {
  it("shows an open call as accepting proposals", async () => {
    stubFetch("open");
    render(<PublicChallengeRecord id={projection.challenge_id} />);

    await waitFor(() => expect(screen.getByText(projection.title)).toBeInTheDocument());
    expect(screen.getByText("پذیرش پیشنهاد")).toBeInTheDocument();
    expect(screen.queryByText(/پیشنهاد تازه نمی‌پذیرد/)).not.toBeInTheDocument();
  });

  /**
   * B6 keeps the projection row of a paused/closed/cancelled call precisely so
   * a solver holding the link can see it stopped accepting proposals. The page
   * used to render a fixed "published" badge for every state, which handed
   * that solver a call they could not apply to.
   */
  it.each([
    ["paused", "پذیرش موقتاً متوقف"],
    ["closed", "پذیرش بسته شده"],
    ["cancelled", "فراخوان لغو شده"],
  ] as const)("tells a solver that a %s call is not accepting proposals", async (state, label) => {
    stubFetch(state);
    render(<PublicChallengeRecord id={projection.challenge_id} />);

    await waitFor(() => expect(screen.getByText(projection.title)).toBeInTheDocument());
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByText(/پیشنهاد تازه نمی‌پذیرد/)).toBeInTheDocument();
    expect(screen.queryByText("پذیرش پیشنهاد")).not.toBeInTheDocument();
  });

  it("renders the deadline in Tehran time, not the runtime zone", async () => {
    stubFetch("open");
    render(<PublicChallengeRecord id={projection.challenge_id} />);

    // 2030-06-01T20:29:59.999Z is 23:59 on 11 Khordad in Tehran.
    await waitFor(() => expect(screen.getByText(/۲۳:۵۹/)).toBeInTheDocument());
    expect(screen.getByText("به وقت تهران")).toBeInTheDocument();
  });
});
