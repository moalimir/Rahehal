"use client";

import Link from "next/link";
import { OrganizationLogo } from "@/components/challenge-organization-logo";
import { Icon } from "@/components/icons";
import { setOpportunitySaved } from "@/lib/solver/saved-opportunities";
import {
  budgetLabel,
  challengeItems,
  daysRemaining,
  scenarioLabels,
  type ChallengeLayout,
  type Scenario,
} from "@/components/challenge-discovery/catalog";

export function ScenarioBadge({ scenario }: { scenario: Scenario }) {
  return <span className={`rh-scenario rh-scenario--${scenario}`}>{scenarioLabels[scenario]}</span>;
}

export function ChallengeCard({
  challenge,
  layout,
  compared,
  onCompare,
  saved,
  onSavedChange,
  basePath,
  contextQuery,
  workspaceId,
}: {
  challenge: (typeof challengeItems)[number];
  layout: ChallengeLayout;
  compared: boolean;
  onCompare: (checked: boolean) => void;
  saved: boolean;
  onSavedChange: (saved: boolean) => void;
  basePath: string;
  contextQuery: string;
  workspaceId: string;
}) {
  const toggleSaved = () => {
    const next = !saved;
    setOpportunitySaved(challenge.id, next, workspaceId);
    onSavedChange(next);
  };

  return (
    <article className={`rh-challenge-card rh-challenge-card--${layout} is-${challenge.scenario}`}>
      <section className="rh-challenge-card__primary" aria-label="مشخصات چالش">
        <div className="rh-challenge-identity">
          <OrganizationLogo organization={challenge.publisher} />
          <div>
            <Link href={`/organizations/${challenge.publisher.slug}`}>
              {challenge.publisher.name}
            </Link>
            <span>{challenge.publisher.industry}</span>
          </div>
        </div>
        <h2>
          <Link href={`${basePath}/${challenge.slug}${contextQuery}`}>{challenge.title}</Link>
        </h2>
        <p className="rh-challenge-card__summary">{challenge.industry}</p>
        <div className="rh-tag-row">
          {challenge.tags.slice(0, 2).map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
      </section>
      <section className="rh-challenge-card__facts" aria-label="اطلاعات اجرایی چالش">
        <dl>
          <div>
            <dt>
              <Icon name="people" /> متقاضی مجاز
            </dt>
            <dd>{challenge.applicants.join("، ")}</dd>
          </div>
          <div>
            <dt>
              <Icon name="decision" /> بودجه
            </dt>
            <dd>{budgetLabel(challenge.budget)}</dd>
          </div>
          <div>
            <dt>
              <Icon name="history" /> مهلت
            </dt>
            <dd>
              {challenge.scenario === "closed"
                ? "پایان‌یافته"
                : `${daysRemaining(challenge.deadline).toLocaleString("fa-IR")} روز`}
            </dd>
          </div>
        </dl>
      </section>
      <section className="rh-challenge-card__actions" aria-label="وضعیت و اقدام‌های چالش">
        <header className="rh-challenge-card__status">
          <span className="rh-active-pill">
            {challenge.scenario === "closed" ? "بسته" : "فعال"}
          </span>
          <button
            type="button"
            className={saved ? "is-saved" : ""}
            onClick={toggleSaved}
            aria-pressed={saved}
            aria-label={
              saved ? `حذف ${challenge.title} از ذخیره‌شده‌ها` : `ذخیره ${challenge.title}`
            }
          >
            <Icon name="history" />
          </button>
        </header>
        <ScenarioBadge
          scenario={saved && challenge.scenario === "new" ? "saved" : challenge.scenario}
        />
        <p className="rh-match-note">
          {challenge.scenario === "new"
            ? "اولین‌بار است این فرصت را می‌بینید"
            : challenge.scenario === "submitted"
              ? "نسخه ارسال‌شده شما قابل پیگیری است"
              : challenge.scenario === "revision"
                ? "سازمان توضیح تکمیلی درخواست کرده است"
                : challenge.evidenceReasons[0]}
        </p>
        <footer>
          <label>
            <input
              type="checkbox"
              checked={compared}
              onChange={(event) => onCompare(event.target.checked)}
            />{" "}
            <span>مقایسه</span>
          </label>
          <Link href={`${basePath}/${challenge.slug}${contextQuery}`}>مشاهده جزئیات</Link>
        </footer>
      </section>
    </article>
  );
}
