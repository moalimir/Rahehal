import Link from "next/link";
import { challengeStatuses, type ChallengeStatus } from "@/domain/challenge";

export function StatusBadge({ status }: { status: ChallengeStatus }) {
  const definition = challengeStatuses[status];
  return (
    <span className={`challenge-status challenge-status--${definition.tone}`}>
      {definition.label}
    </span>
  );
}

export function ChallengeShell({
  title,
  description,
  id,
  status,
  lastSaved,
  actions,
  children,
}: {
  title: string;
  description?: string;
  id?: string;
  status?: ChallengeStatus;
  lastSaved?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="challenge-app-shell challenge-module-shell">
      <div className="challenge-main">
        <nav className="challenge-breadcrumb" aria-label="مسیر صفحه">
          <Link href="/app/org/challenges">مسئله‌ها</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{title}</span>
        </nav>
        <header className="challenge-page-heading">
          <div>
            <h1>{title}</h1>
            {description && <p>{description}</p>}
          </div>
          {actions && <div className="challenge-page-heading__actions">{actions}</div>}
        </header>
        {(id || status || lastSaved) && (
          <div className="challenge-record-bar" aria-label="اطلاعات پرونده">
            {status && <StatusBadge status={status} />}
            {id && (
              <span>
                شناسه: <bdi>{id}</bdi>
              </span>
            )}
            {lastSaved && <span>{lastSaved}</span>}
          </div>
        )}
        {children}
      </div>
    </section>
  );
}

export function NotFoundState() {
  return (
    <ChallengeShell
      title="پرونده پیدا نشد"
      description="این شناسه در داده‌های سازمان وجود ندارد یا پیش‌نویس حذف شده است."
    >
      <section className="challenge-empty-state">
        <h2>مسیر معتبر است، اما پرونده‌ای برای نمایش نیست</h2>
        <p>به فهرست بازگردید و یکی از پرونده‌های موجود را انتخاب کنید.</p>
        <Link className="challenge-button challenge-button--primary" href="/app/org/challenges">
          بازگشت به مسئله‌ها
        </Link>
      </section>
    </ChallengeShell>
  );
}
