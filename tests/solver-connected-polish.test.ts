import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("connected solver workspace polish", () => {
  const css = readFileSync("app/solver-workspace.css", "utf8");
  const profile = readFileSync("components/solver/connected-profile.tsx", "utf8");
  const dashboard = readFileSync("components/solver/connected-dashboard.tsx", "utf8");
  const dashboardCards = readFileSync("components/solver/connected-dashboard-cards.tsx", "utf8");
  const proposalEditor = readFileSync("components/solver/connected-proposal-editor.tsx", "utf8");
  const notifications = readFileSync("components/solver/connected-notifications.tsx", "utf8");
  const offers = readFileSync("components/solver/connected-opportunities.tsx", "utf8");
  const unreadBadge = readFileSync("lib/workspace/unread-badge.ts", "utf8");

  it("keeps the verification action in a dedicated responsive card", () => {
    expect(profile).toContain("rh-connected-settings-verification");
    expect(profile).toContain("مشاهده وضعیت احراز");
    expect(css).toMatch(
      /\.rh-connected-verification-card\s*\{[\s\S]*?grid-template-columns:\s*52px minmax\(0, 1fr\) auto/,
    );
    expect(css).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.rh-connected-verification-card,[\s\S]*?grid-template-columns:\s*48px minmax\(0, 1fr\)/,
    );
  });

  it("uses explicit connected form fields for profile and proposal inputs", () => {
    expect(profile).toContain("rh-connected-profile-form__grid");
    expect(proposalEditor).toContain("proposalFieldSections.map");
    expect(proposalEditor).toContain("rh-connected-proposal-section__grid");
    expect(proposalEditor).toContain('? "rh-connected-field is-wide"');
    expect(proposalEditor).not.toContain('className="rh-wizard-editor"');
    expect(css).toMatch(
      /\.rh-connected-field input,[\s\S]*?\.rh-connected-field textarea[\s\S]*?border:\s*1px solid #ccd8e4/,
    );
  });

  it("renders the dashboard from compact live-data cards with honest empty states", () => {
    expect(dashboard).toContain("rh-connected-dashboard-hero__summary");
    expect(dashboard).toContain("rh-connected-dashboard-empty");
    expect(dashboardCards).toContain("rh-connected-profile-card__readiness");
    expect(dashboardCards).toContain("rh-connected-action-card__empty");
    expect(dashboardCards).not.toContain('className="rh-action-card"');
  });

  it("keeps the connected override after legacy styles and stacks actions on narrow screens", () => {
    expect(css.lastIndexOf("Connected solver workspace polish")).toBeGreaterThan(
      css.lastIndexOf(".rh-membership-list"),
    );
    expect(css).toMatch(
      /@media \(max-width: 520px\)[\s\S]*?\.rh-connected-proposal-actions > button\s*\{[\s\S]*?inline-size:\s*100%/,
    );
    expect(css).toContain(".rh-connected-proposal-editor button:focus-visible");
  });

  it("keeps notification rows and the header badge synchronized", () => {
    expect(notifications).toContain("announceNotificationStateChanged()");
    expect(notifications).toContain("window.setInterval(refreshVisible, 15_000)");
    expect(unreadBadge).toContain("window.addEventListener(NOTIFICATION_STATE_CHANGED");
    expect(unreadBadge).toContain("NOTIFICATION_POLL_INTERVAL_MS = 15_000");
  });

  it("makes direct offers explicitly workspace-scoped and deep-linkable", () => {
    expect(offers).toContain("پیشنهادهای ارسالی شما نیست");
    expect(offers).toContain('new URLSearchParams(window.location.search).get("offer")');
    expect(offers).toContain('? "rh-card rh-connected-offer-card is-focused"');
    expect(offers).toContain("دعوت‌های فضای شخصی و تیمی با هم ترکیب نمی‌شوند");
    expect(notifications).toContain("received-proposals/?offer=");
    expect(css).toContain(".rh-connected-offer-grid");
  });
});
