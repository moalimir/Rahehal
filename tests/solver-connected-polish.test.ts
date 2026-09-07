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
  const proposalList = readFileSync("components/solver/connected-proposal-list.tsx", "utf8");
  const teams = readFileSync("components/solver/connected-teams.tsx", "utf8");

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
    expect(unreadBadge).toContain("NOTIFICATION_POLL_INTERVAL_MS = 15_000");
    // The 15s poll is visibility-gated so a background tab stays quiet, but the
    // commit announcement is not: it re-reads whatever the document's
    // visibility happens to be, or the header keeps a count the page below it
    // has already cleared.
    expect(unreadBadge).toContain("window.addEventListener(NOTIFICATION_STATE_CHANGED, refresh)");
    expect(unreadBadge).toContain(
      "window.setInterval(refreshVisible, NOTIFICATION_POLL_INTERVAL_MS)",
    );
  });

  it("returns to the personal workspace after leaving or archiving a team", () => {
    // Leaving ends the context you were working in and the server drops it, so
    // the page fell through to `/app`'s resolver and asked which workspace to
    // enter -- a question with one obvious answer, since the personal workspace
    // is the one a solver always holds and never leaves. The chooser is right
    // after signing in, where the choice is real, and wrong here.
    const teams = readFileSync("components/solver/connected-teams.tsx", "utf8");
    expect(teams).toContain('workspace.kind === "individual"');
    expect(teams).toMatch(/leavesActiveWorkspace && personalWorkspaceId/);
    expect(teams).toMatch(/runtime\.switchWorkspace\(personalWorkspaceId\)/);
    // Both exits opt in; nothing else on the page does.
    expect(teams.match(/\{ leavesActiveWorkspace: true \}/g)).toHaveLength(2);
  });

  it("refreshes the workspace list after a team command changes it", () => {
    // Accepting an invitation said "دعوت پذیرفته شد" and left the team out of
    // "تیم‌های من" and the workspace switcher until a full reload: both read
    // `/me`, and only the family read was refreshed.
    const teams = readFileSync("components/solver/connected-teams.tsx", "utf8");
    // Identity is re-read before the family, on every success path: the list
    // and the switcher are built from `/me`, so refreshing only the family left
    // the page contradicting its own success message until a full reload.
    const success = teams.slice(teams.indexOf("const run = async"), teams.indexOf("const team ="));
    expect(success.indexOf("await runtime.refreshMe()")).toBeGreaterThan(-1);
    expect(success.indexOf("await runtime.refreshMe()")).toBeLessThan(
      success.indexOf("connected.refresh()"),
    );
  });

  it("names the action a proposal's state actually offers", () => {
    // One fixed "اعمال اصلاحات" sat above every actionable state, so a person
    // answering a clarification and a person revising a locked version were
    // invited to the same button under the same wrong name. The editor behind
    // it was already state-aware; only the invitation was not.
    const detail = readFileSync("components/solver/connected-proposal-detail.tsx", "utf8");
    expect(detail).toContain('clarification_requested: "پاسخ به شفاف‌سازی"');
    expect(detail).toContain('revision_requested: "شروع نسخه اصلاح‌شده"');
    expect(detail).not.toMatch(/>\s*اعمال اصلاحات\s*</);
  });

  it("shows a typed week count in the digits the rest of the page uses", () => {
    // `duration_weeks` is stored as the string a person typed, so it arrives
    // here in whatever digits they used. Rendering it raw put a Latin `16`
    // beside `نسخه ۵` and `۱٬۵۰۰٬۰۰۰ ریال` on the same record.
    const fields = readFileSync("lib/workspace/proposal-content-fields.ts", "utf8");
    expect(fields).toContain("persianDigits(content[field])");
    for (const path of [
      "components/solver/connected-proposal-detail.tsx",
      "components/solver/connected-organization-proposals.tsx",
    ]) {
      expect(readFileSync(path, "utf8")).not.toMatch(/\$\{content\.duration_weeks\}/);
    }
  });

  it("names what a notification's identifier belongs to", () => {
    // Every row printed a bare `wsp_…`/`prp_…` under its headline, which reads
    // as noise and, in Persian, reorders around the punctuation beside it.
    // `RecordId` is the sanctioned place for an opaque identifier: labelled,
    // isolated, and copyable.
    expect(notifications).toContain("<RecordId value={item.subject_id}");
    expect(notifications).toContain('proposal: "شناسه پیشنهاد"');
    expect(notifications).not.toMatch(/<bdi dir="ltr">\{item\.subject_id\}<\/bdi>/);
  });

  it("gives the solver sidebar the unread badge the organization already had", () => {
    // The solver had only the topbar dot, so the same unread state was
    // announced at two different volumes depending on which persona you were.
    const shell = readFileSync("components/solver-shell.tsx", "utf8");
    expect(shell).toContain('item.key === "notifications" && connected.unreadCount > 0');
    const roleShells = readFileSync("components/role-shells.tsx", "utf8");
    expect(roleShells).toContain('item.key === "notifications"');
  });

  it("makes direct offers explicitly workspace-scoped and deep-linkable", () => {
    expect(offers).toContain("پیشنهادهای ارسالی شما نیست");
    expect(offers).toContain('new URLSearchParams(window.location.search).get("offer")');
    expect(offers).toContain('? "rh-card rh-connected-offer-card is-focused"');
    expect(offers).toContain("دعوت‌های فضای شخصی و تیمی با هم ترکیب نمی‌شوند");
    expect(notifications).toContain("received-proposals/?offer=");
    expect(css).toContain(".rh-connected-offer-grid");
  });

  it("groups the solver's own proposals by the call they answer", () => {
    // Both sides of a conversation are organised the same way: the solver
    // reads their proposals grouped by call, as the organization reads its
    // inbox. Revisions of one call had been scattered through a flat list.
    expect(proposalList).toContain("rh-connected-proposal-group");
    expect(proposalList).toMatch(/byChallenge/);
    expect(proposalList).toMatch(/right\.waiting - left\.waiting \|\| right\.latest/);
    expect(proposalList).toContain("نیازمند اقدام شما");
  });

  it("counts each status on the filter rather than only offering it", () => {
    expect(proposalList).toContain("statusCounts");
    expect(proposalList).toContain('role="tablist"');
  });

  it("says how many proposals there are in plain Persian", () => {
    // "پیشنهاد سروری" was developer shorthand for "read from the server" and
    // told the person reading it nothing.
    // Matched as rendered output, not as a bare substring: the comment
    // recording why the phrase went away legitimately still names it.
    expect(proposalList).not.toMatch(/\}\s*پیشنهاد سروری/);
    expect(proposalList).toContain("هنوز پیشنهادی در این فضای کاری ندارید");
  });

  it("shows a saved profile as a profile, not as the form again", () => {
    // The page only ever rendered the editor, so a solver who had already
    // written their profile came back to the same four empty-looking inputs
    // with no sense that anything had been saved.
    expect(profile).toContain("rh-connected-profile-summary");
    expect(profile).toContain("ویرایش پروفایل");
    expect(profile).toMatch(/const hasProfile = /);
    // Saving returns to the read view; an unsaved draft and a committed save
    // must not look the same.
    expect(profile).toMatch(/setEditing\(false\);\s*\n\s*refresh\(\)/);
    // Cancelling restores what the server still holds rather than keeping
    // edits that were never committed.
    expect(profile).toContain("setHeadline(profile.headline)");
  });

  it("gives personal and team profiles distinct résumé language and live completion guidance", () => {
    expect(profile).toContain('"پروفایل تیم"');
    expect(profile).toContain('"پروفایل و رزومه"');
    expect(profile).toContain('"معرفی تیم"');
    expect(profile).toContain('"درباره من"');
    expect(profile).toContain('role="progressbar"');
    expect(profile).toContain("completionPercent");
    expect(profile).toContain("تغییرات ذخیره‌نشده دارید.");
    expect(profile).toContain("پروفایل کامل است");
    expect(profile).not.toContain("آماده ارسال پیشنهاد");
    expect(css).toContain(".rh-connected-profile-layout");
    expect(css).toContain(".rh-connected-profile-summary__details");
  });

  it("keeps profile feedback human-readable and scoped to the workspace that changed", () => {
    expect(profile).toContain("notice?.workspaceId === profile.workspace_id");
    expect(profile).toContain("تغییرات پروفایل با موفقیت ذخیره شد.");
    expect(profile).not.toContain("شناسه همبستگی");
  });

  it("does not offer team profile or verification mutations to read-only members", () => {
    expect(profile).toContain('decideTeamPermission("edit-team-profile"');
    expect(profile).toContain("canEditProfile &&");
    expect(profile).toContain("canManageVerification &&");
    expect(profile).toContain("دسترسی فقط مشاهده");
    expect(profile).toContain("شروع احراز برای مالک یا مدیر تیم در دسترس است.");
  });

  it("lists the teams a human belongs to on the teams page", () => {
    // The page was titled "تیم‌ها و همکاری" and listed no teams: from an
    // individual workspace it showed only invitations, so someone who owned
    // two teams could not see them.
    expect(teams).toContain("تیم‌های من");
    expect(teams).toMatch(
      /workspaces \?\? \[\]\)\s*\n?\s*\.filter\(\(workspace\) => workspace\.kind === "team"\)/,
    );
    expect(teams).toContain("switchWorkspace");
  });

  it("separates invitations still waiting from ones already answered", () => {
    // An accepted invitation sat at the top of "دعوت‌های دریافتی" with no
    // action, looking like something still owed a response.
    expect(teams).toContain("openInvitations");
    expect(teams).toContain("settledInvitations");
    expect(teams).toContain("دعوت‌های در انتظار پاسخ");
    expect(teams).toContain("دعوت‌های پاسخ‌داده‌شده");
  });

  it("presents team management as one responsive workspace rather than generic cards", () => {
    expect(teams).toContain("rh-team-management-hero");
    expect(teams).toContain("rh-team-management-hero__stats");
    expect(teams).toContain("rh-team-invite-form");
    expect(teams).toContain("rh-team-collaboration-grid");
    expect(teams).toContain("<TeamEmptyState");
    expect(teams).not.toContain('className="rh-card rh-profile-filters"');
    expect(css).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.rh-team-collaboration-grid\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/,
    );
  });

  it("omits team-management sections the active member cannot read", () => {
    expect(teams).toContain("view.failures.filter(teamFailureNeedsAttention)");
    expect(teams).toContain('teamFamilyAvailable(view, "sentInvitations")');
    expect(teams).toContain('teamFamilyAvailable(view, "requests")');
    expect(teams).toContain("sentInvitationsAvailable &&");
    expect(teams).toContain("incomingRequestsAvailable &&");
  });

  it("keeps workspace ids available as labelled copy controls", () => {
    expect(teams).toContain('<RecordId value={team.workspace_id} label="شناسه فضای کاری تیم" />');
    expect(teams).not.toMatch(/<bdi dir="ltr">\{team\.workspace_id\}<\/bdi>/);
    expect(profile).toContain('<RecordId value={activeWorkspace.id} label="شناسه فضای کاری" />');
    expect(profile).toContain("rh-connected-settings-workspace-id");
  });

  it("offers every canonical team kind during connected team creation", () => {
    expect(teams).toContain('<option value="expert-team">تیم مستقل</option>');
    expect(teams).toContain('<option value="company">شرکت رسمی</option>');
    expect(teams).toContain('<option value="academic-group">گروه دانشگاهی</option>');
    expect(teams).toContain('<option value="lab">آزمایشگاه</option>');
  });
});
