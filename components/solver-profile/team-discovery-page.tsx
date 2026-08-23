"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Icon } from "@/components/icons";
import { PersonAvatar } from "@/components/person-avatar";
import { PageHeading, Toast, useCanonicalSolverState } from "@/components/solver-profile/shared";
import { teamCandidateSeed, type TeamCandidate } from "@/components/solver-profile/team-candidates";
import { useSolverContext } from "@/components/solver-shell";
import { teamRole } from "@rahhal/domain";
import { buildSolverHref } from "@/lib/solver/context";
import { sendTeamInvitation, teamPermission } from "@/lib/solver/repository";

export function TeamMemberDiscoveryPage() {
  const context = useSolverContext();
  const state = useCanonicalSolverState();
  const activeTeam =
    context.type === "team" ? state.teams.find((team) => team.id === context.teamId) : undefined;
  const invitePermission = teamPermission(context, "invite-member", {}, state);
  const [query, setQuery] = useState("");
  const [expertise, setExpertise] = useState("all");
  const [university, setUniversity] = useState("all");
  const [collaboration, setCollaboration] = useState("all");
  const [sort, setSort] = useState("evidence");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [invited, setInvited] = useState<string[]>([]);
  const [selected, setSelected] = useState<TeamCandidate | null>(null);
  const [toast, setToast] = useState("");
  const visibleCandidates = useMemo(() => {
    const normalizedQuery = query.trim();
    return teamCandidateSeed
      .filter((item) => {
        const searchable = [
          item.name,
          item.title,
          item.expertise,
          item.city,
          item.university,
          ...item.skills,
        ].join(" ");
        return (
          (!normalizedQuery || searchable.includes(normalizedQuery)) &&
          (expertise === "all" || item.expertise === expertise) &&
          (university === "all" || item.university === university) &&
          (collaboration === "all" || item.collaborations.includes(collaboration))
        );
      })
      .sort((first, second) => {
        if (sort === "name") return first.name.localeCompare(second.name, "fa");
        if (sort === "availability") {
          return second.availability.localeCompare(first.availability, "fa");
        }
        return second.evidenceRank - first.evidenceRank;
      });
  }, [collaboration, expertise, query, sort, university]);
  const filtersAreActive =
    Boolean(query.trim()) || expertise !== "all" || university !== "all" || collaboration !== "all";
  const resetFilters = () => {
    setQuery("");
    setExpertise("all");
    setUniversity("all");
    setCollaboration("all");
    setSort("evidence");
  };
  const invite = (candidate: TeamCandidate) => {
    if (context.type !== "team") return;
    const result = sendTeamInvitation(context, {
      recipientEmail: `${candidate.id.toLowerCase()}@example.test`,
      proposedRole: teamRole.contributor,
      scope: `همکاری تخصصی در ${candidate.expertise}`,
      message: `دعوت ${activeTeam?.name ?? "تیم"} بر اساس شواهد مهارت و ظرفیت اعلام‌شده`,
      commitment: candidate.availability,
      ipNotice: "شرایط مالکیت فکری پیش از پذیرش دعوت قابل مشاهده است.",
    });
    if (!result.ok) {
      setToast(result.message);
      return;
    }
    const name = candidate.name;
    setInvited((current) => [...new Set([...current, name])]);
    setToast(`دعوت ${name} از طرف «${activeTeam?.name}» با رسید ${result.receiptId} ثبت شد.`);
  };
  return (
    <>
      <PageHeading
        title="تکمیل اعضای تیم"
        description="بر اساس نقش‌های خالی تیم، متخصصان متناسب را پیدا و با دامنه همکاری روشن دعوت کنید."
        action={
          <Link
            className="rh-profile-outline"
            href={buildSolverHref("/app/solver/invitations", context)}
          >
            <Icon name="notification" />
            دعوت‌نامه‌های تیمی
          </Link>
        }
      />
      <section className="rh-card rh-team-building-toolbar">
        <label className="rh-profile-search">
          <Icon name="search" />
          <span className="sr-only">جست‌وجوی متخصص</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="جست‌وجو بر اساس نام، مهارت یا شهر"
          />
        </label>
        <select
          aria-label="حوزه تخصص"
          value={expertise}
          onChange={(event) => setExpertise(event.target.value)}
        >
          <option value="all">همه تخصص‌ها</option>
          {[...new Set(teamCandidateSeed.map((item) => item.expertise))].map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <select
          aria-label="دانشگاه"
          value={university}
          onChange={(event) => setUniversity(event.target.value)}
        >
          <option value="all">همه دانشگاه‌ها</option>
          {[...new Set(teamCandidateSeed.map((item) => item.university))].map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <select
          aria-label="نوع همکاری"
          value={collaboration}
          onChange={(event) => setCollaboration(event.target.value)}
        >
          <option value="all">همه شیوه‌های همکاری</option>
          <option>حضوری</option>
          <option>دورکار</option>
          <option>پروژه‌ای</option>
          <option>تمام‌وقت</option>
        </select>
        <div className="rh-team-building-toolbar__actions">
          <label>
            <span className="sr-only">مرتب‌سازی متخصصان</span>
            <select value={sort} onChange={(event) => setSort(event.target.value)}>
              <option value="evidence">مرتب‌سازی: شواهد مرتبط‌تر</option>
              <option value="name">مرتب‌سازی: نام</option>
              <option value="availability">مرتب‌سازی: ظرفیت همکاری</option>
            </select>
          </label>
          <button type="button" onClick={resetFilters} disabled={!filtersAreActive}>
            <Icon name="close" /> پاک‌کردن فیلترها
          </button>
        </div>
      </section>
      <header className="rh-team-building-results">
        <div>
          <h2>متخصصان پیشنهادی</h2>
          <p>
            {visibleCandidates.length.toLocaleString("fa-IR")} پروفایل با شواهد قابل بررسی برای
            نیازهای تیم
          </p>
        </div>
        <div role="group" aria-label="نوع نمایش نتایج">
          <button
            type="button"
            className={view === "grid" ? "is-active" : ""}
            aria-pressed={view === "grid"}
            onClick={() => setView("grid")}
          >
            <Icon name="grid" /> <span className="sr-only">نمایش شبکه‌ای</span>
          </button>
          <button
            type="button"
            className={view === "list" ? "is-active" : ""}
            aria-pressed={view === "list"}
            onClick={() => setView("list")}
          >
            <Icon name="brief" /> <span className="sr-only">نمایش فهرستی</span>
          </button>
        </div>
      </header>
      <section
        className={`rh-team-building-grid rh-team-building-grid--${view}`}
        aria-label="متخصصان پیشنهادی"
      >
        {visibleCandidates.map((candidate) => (
          <article className="rh-card" key={candidate.id}>
            <div className="rh-team-candidate__identity">
              <PersonAvatar name={candidate.name} className="rh-avatar rh-avatar--large" />
              <div>
                <small className="rh-team-candidate__fit">شواهد مرتبط موجود است</small>
                <h2>{candidate.name}</h2>
                <p>{candidate.title}</p>
              </div>
            </div>
            <dl className="rh-team-candidate__facts">
              <div>
                <dt>شهر</dt>
                <dd>{candidate.city}</dd>
              </div>
              <div>
                <dt>دانشگاه</dt>
                <dd>{candidate.university}</dd>
              </div>
              <div>
                <dt>وضعیت پروفایل</dt>
                <dd>
                  <Icon name="check" /> رزومه قابل مشاهده
                </dd>
              </div>
            </dl>
            <div className="rh-tag-row">
              {candidate.skills.map((skill) => (
                <span key={skill}>{skill}</span>
              ))}
              <span className="is-ready">آماده همکاری</span>
            </div>
            <footer>
              <button
                type="button"
                disabled={invited.includes(candidate.name) || !invitePermission.allowed}
                title={invitePermission.allowed ? undefined : invitePermission.reason}
                onClick={() => invite(candidate)}
              >
                {invited.includes(candidate.name) ? "دعوت ارسال شد" : "دعوت به همکاری"}
              </button>
              <button
                type="button"
                className="rh-team-profile-link"
                onClick={() => setSelected(candidate)}
              >
                مشاهده پروفایل
              </button>
            </footer>
          </article>
        ))}
      </section>
      {!visibleCandidates.length && (
        <section className="rh-card rh-profile-empty">
          <Icon name="search" />
          <h2>متخصصی با این فیلترها پیدا نشد</h2>
          <p>یکی از فیلترها را تغییر دهید یا همه فیلترها را پاک کنید.</p>
          <button type="button" onClick={resetFilters}>
            پاک‌کردن همه فیلترها
          </button>
        </section>
      )}
      {selected && (
        <div className="rh-profile-modal" role="presentation">
          <section
            className="rh-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="candidate-title"
          >
            <button
              className="rh-modal-close"
              type="button"
              onClick={() => setSelected(null)}
              aria-label="بستن"
            >
              <Icon name="close" />
            </button>
            <div className="rh-candidate-modal-head">
              <PersonAvatar name={selected.name} className="rh-avatar rh-avatar--large" />
              <div>
                <small>دلایل دعوت قابل بررسی</small>
                <h2 id="candidate-title">{selected.name}</h2>
                <p>
                  {selected.title} · {selected.city}
                </p>
              </div>
            </div>
            <dl className="rh-candidate-facts">
              <div>
                <dt>ظرفیت همکاری</dt>
                <dd>{selected.availability}</dd>
              </div>
              <div>
                <dt>سابقه مرتبط</dt>
                <dd>{selected.projects}</dd>
              </div>
              <div>
                <dt>شیوه همکاری</dt>
                <dd>{selected.collaborations.join(" و ")}</dd>
              </div>
            </dl>
            <p>
              پیش از پذیرش دعوت، نقش پیشنهادی، دامنه دسترسی و چالش هدف برای این متخصص نمایش داده
              می‌شود.
            </p>
            <footer>
              <button type="button" onClick={() => setSelected(null)}>
                بستن
              </button>
              <button
                type="button"
                className="is-primary"
                disabled={invited.includes(selected.name) || !invitePermission.allowed}
                onClick={() => {
                  invite(selected);
                  setSelected(null);
                }}
              >
                {invited.includes(selected.name) ? "دعوت قبلاً ارسال شده" : "دعوت به همکاری"}
              </button>
            </footer>
          </section>
        </div>
      )}
      <Toast message={toast} />
    </>
  );
}
