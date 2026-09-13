// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/runtime-provider", () => ({
  useWebRuntime: () => ({
    sessionStatus: "authenticated",
    me: null,
    switchWorkspace: vi.fn(),
  }),
}));

import { NetworkInternalBoundary } from "@/components/internal/network-internal-boundary";
import { internalRoutes } from "@/data/internal-routes";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("connected reviewer deep-link boundary", () => {
  it.each(["conflict", "materials", "score", "compare", "submit"])(
    "never renders demo %s even with browser COI poisoned",
    (step) => {
      localStorage.setItem("rahhal:review-assignment:RV-204:coi:v1", "clear");
      const path = `/app/reviewer/assignments/RV-204/${step}`;
      const route = internalRoutes.find((candidate) => candidate.path === path);
      if (!route) throw new Error(`Missing registered route: ${path}`);
      const renderDemo = vi.fn(() => <p>demo materials and scoring</p>);
      render(<NetworkInternalBoundary route={route}>{renderDemo}</NetworkInternalBoundary>);
      expect(renderDemo).not.toHaveBeenCalled();
      expect(screen.queryByText("demo materials and scoring")).not.toBeInTheDocument();
      expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    },
  );
});
