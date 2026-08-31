/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ChallengePublicPageSuccessEnvelope,
  ChallengePublicProjectionResource,
} from "@rahhal/contracts";
import { parseChallengeId, parseChallengeVersionId, parseCorrelationId } from "@rahhal/domain";

import { PublicChallengeCatalogue } from "@/components/public-challenge-catalogue";
import { listPublicChallenges } from "@/lib/challenges/adapters/network-public-challenges";

const publicChallenge = {
  challenge_id: parseChallengeId("chl_public_catalogue_001"),
  challenge_version_id: parseChallengeVersionId("chv_public_catalogue_001"),
  title: "کاهش مصرف آب در خط رنگ",
  category: "energy",
  location: "تهران",
  public_summary: "فراخوان عمومی برای کاهش سنجش‌پذیر مصرف آب.",
  output_type: "pilot",
  sourcing_model: "public",
  applicant_scope: "both",
  allowed_applicant_types: ["individual", "expert-team"],
  work_mode: "hybrid",
  proposal_deadline: "2030-02-01T00:00:00.000Z",
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

const envelope = {
  ok: true,
  data: { items: [publicChallenge], next_cursor: null },
  meta: {
    server_time: "2026-08-30T10:00:00.000Z",
    correlation_id: parseCorrelationId("cor_public_catalogue"),
  },
} as const satisfies ChallengePublicPageSuccessEnvelope;

function response(): Response {
  return new Response(JSON.stringify(envelope), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("connected public challenge catalogue", () => {
  it("forwards only supported public-list filters", async () => {
    const fetchMock = vi.fn(async () => response());
    vi.stubGlobal("fetch", fetchMock);

    const result = await listPublicChallenges({ category: "energy", cursor: "next page" });

    expect(result.ok && result.data.items).toEqual([publicChallenge]);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/public/challenges?category=energy&cursor=next+page",
      expect.objectContaining({ credentials: "same-origin", cache: "no-store" }),
    );
  });

  it("renders projection fields without fixture-only publisher or match data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response()),
    );

    render(<PublicChallengeCatalogue />);

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: publicChallenge.title })).toBeVisible(),
    );
    expect(screen.getByText(publicChallenge.public_summary)).toBeVisible();
    expect(screen.getByText("متخصص مستقل، تیم تخصصی")).toBeVisible();
    expect(screen.getByRole("link", { name: publicChallenge.title })).toHaveAttribute(
      "href",
      `/challenges/record?id=${publicChallenge.challenge_id}`,
    );
    expect(document.body).not.toHaveTextContent("امتیاز تطابق");
    expect(document.body).not.toHaveTextContent("سازمان نمونه");
  });
});
