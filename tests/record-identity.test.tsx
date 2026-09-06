// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RecordId, RecordReference } from "@/components/solver/record-identity";

describe("record identity", () => {
  it("isolates an opaque identifier from the surrounding right-to-left text", () => {
    // `prp_a2b0952f…` is Latin inside Persian. Without isolation it reorders
    // around neighbouring punctuation and the human reads a different string
    // than the one stored.
    render(<RecordId value="prp_a2b0952f1ee8439ba1672b1dba3ebc73" />);
    const isolated = screen.getByText("prp_a2b0952f1ee8439ba1672b1dba3ebc73");
    expect(isolated.tagName).toBe("BDI");
    expect(isolated).toHaveAttribute("dir", "ltr");
  });

  it("names what an opaque identifier belongs to", () => {
    // Read letter by letter with no context, a bare hex string tells a screen
    // reader user nothing about which record it identifies.
    render(<RecordId value="prp_a2b0952f" label="شناسه پیشنهاد" />);
    expect(screen.getByRole("button", { name: "شناسه پیشنهاد: prp_a2b0952f" })).toBeInTheDocument();
  });

  it("copies the identifier so it need not be selected by hand", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    render(<RecordId value="prp_a2b0952f" />);
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("prp_a2b0952f"));
  });

  it("marks the copy so the click is visibly acknowledged", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });

    render(<RecordId value="prp_a2b0952f" />);
    fireEvent.click(screen.getByRole("button"));

    // The class is two names, not a concatenation: `rh-record-id` plus
    // `is-copied`. Building it by interpolation once produced
    // `rh-record-idis-copied`, so the confirmation style never applied.
    await waitFor(() =>
      expect(screen.getByRole("button").className.split(/\s+/)).toContain("is-copied"),
    );
  });

  it("selects the identifier when the browser refuses the clipboard", () => {
    // Insecure origins, embedded views and an unfocused document all refuse.
    // Those are ordinary conditions, so the click still has to achieve
    // something: the value is selected for the person to copy by hand.
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });

    render(<RecordId value="prp_a2b0952f" />);
    expect(() => fireEvent.click(screen.getByRole("button"))).not.toThrow();
    expect(window.getSelection()?.toString()).toBe("prp_a2b0952f");
  });

  it("renders nothing when a record has no human reference yet", () => {
    // An unsubmitted proposal has no tracking code. The caption must be absent
    // rather than falling back to the opaque id, which is what made drafts
    // display 32 hex characters where their title belonged.
    const { container } = render(<RecordReference code={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("can shrink inside a grid or flex cell", () => {
    // The chip's own `min-width: auto` floor resolves to its min-content
    // width, which outranks `max-inline-size` -- a 64-character fingerprint
    // then spilled out of its cell and across the ones beside it. Both rules
    // are load-bearing: one lets the chip shrink, the other ellipsises its
    // text once it has.
    const css = readFileSync("app/solver-workspace.css", "utf8");
    expect(css).toMatch(/\.rh-record-id\s*\{[^}]*min-inline-size:\s*0/);
    expect(css).toMatch(/\.rh-record-id\s*\{[^}]*max-inline-size:\s*100%/);
    expect(css).toMatch(/\.rh-record-id bdi\s*\{[^}]*text-overflow:\s*ellipsis/);
  });
});

describe("connected surfaces lead with the human reference", () => {
  const sources = {
    "solver proposal list": "components/solver/connected-proposal-list.tsx",
    "solver proposal detail": "components/solver/connected-proposal-detail.tsx",
    "solver proposal editor": "components/solver/connected-proposal-editor.tsx",
    "solver teams": "components/solver/connected-teams.tsx",
    "organization inbox": "components/solver/connected-organization-proposals.tsx",
    "organization offers": "components/organization/connected-direct-offers.tsx",
    "organization dashboard": "components/organization/connected-dashboard.tsx",
    "solver dashboard": "components/solver/connected-dashboard.tsx",
  } as const;

  it.each(Object.entries(sources))(
    "%s never falls back to an opaque id as a title",
    (_name, path) => {
      const source = readFileSync(path, "utf8");
      // The pattern that caused it: `?? row.id` / `?? item.challenge_id` in a
      // heading position, so a record without a tracking code was titled with
      // its routing key. `RecordId` is the sanctioned place for those strings.
      expect(source).not.toMatch(/\?\?\s*\w+\.id\b/);
      expect(source).not.toMatch(/tracking_code\s*\?\?\s*\w+\.id\b/);
      expect(source).not.toMatch(/trackingCode\s*\?\?\s*\w+\.id\b/);
    },
  );

  it("shows money with a Persian currency name, never a Latin code", () => {
    // `۱۵٬۰۰۰٬۰۰۰ IRR` mixed a Persian numeral group with a Latin ISO code in
    // the same phrase; every other surface already said ریال.
    for (const path of [
      "components/solver/connected-proposal-detail.tsx",
      "components/solver/connected-organization-proposals.tsx",
    ]) {
      const source = readFileSync(path, "utf8");
      expect(source).toContain("currencyLabels[content.budget_currency]");
      expect(source).not.toMatch(/\}\s*\$\{content\.budget_currency\}/);
    }
  });
});
