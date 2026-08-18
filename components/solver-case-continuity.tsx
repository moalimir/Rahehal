"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/internal/shared";
import { Icon } from "@/components/icons";
import { useSolverContext } from "@/components/solver-shell";
import type { InternalRoute } from "@/data/internal-routes";
import type { CaseRecord, MutationResult, ProposalContent, SolverState } from "@/domain/solver";
import { buildSolverHref } from "@/lib/solver/context";
import { challengeEligibilityRules } from "@/lib/solver/eligibility";
import {
  acceptNda,
  approveContract,
  canAccessRestrictedDocument,
  closeCase,
  createContractVersion,
  markNotificationRead,
  notificationsForWorkspace,
  readSolverState,
  sendCaseMessage,
  signContract,
  submitCaseFeedback,
  submitDeliverable,
  submitVerification,
  subscribeSolverState,
  teamPermission,
  updatePilotTask,
} from "@/lib/solver/repository";

function useStore() {
  const [state, setState] = useState<SolverState>(() => readSolverState());
  useEffect(() => subscribeSolverState(() => setState(readSolverState())), []);
  return state;
}

function date(value?: string) {
  if (!value) return "ثبت نشده";
  return new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

function money(value: number) {
  return `${new Intl.NumberFormat("fa-IR").format(value)} تومان`;
}

const proposalFieldLabels: Record<keyof ProposalContent, string> = {
  title: "عنوان راه‌حل",
  problemStatement: "بیان مسئله",
  valueProposition: "ارزش پیشنهادی",
  maturityLevel: "سطح بلوغ",
  prototypeWeeks: "زمان نمونه اولیه",
  technologies: "فناوری‌ها",
  technicalApproach: "رویکرد فنی",
  architecture: "معماری راهکار",
  dataNeeds: "نیازمندی داده",
  successMetrics: "شاخص‌های موفقیت",
  ipStatus: "وضعیت مالکیت فکری",
  durationWeeks: "زمان‌بندی اجرا",
  roadmap: "برنامه اجرا",
  dependencies: "وابستگی‌ها",
  pilotLocation: "محل پایلوت",
  risks: "مدیریت ریسک",
  mitigation: "اقدام کنترلی",
  leadName: "مسئول پیشنهاد",
  teamSummary: "ترکیب تیم اجرا",
  relevantExperience: "تجربه مرتبط",
  requestedBudget: "بودجه درخواستی",
  paymentModel: "مدل پرداخت",
  budgetRationale: "توجیه بودجه",
  startAvailability: "آمادگی شروع",
  teamAvailability: "ظرفیت تیم",
  ndaAccepted: "پذیرش محرمانگی",
  conflictDeclared: "اعلام تعارض منافع",
  ipAccepted: "پذیرش شرایط مالکیت فکری",
  accuracyConfirmed: "تأیید صحت اطلاعات",
  attachmentNames: "پیوست‌ها",
};

function proposalValue(value: ProposalContent[keyof ProposalContent]) {
  if (Array.isArray(value)) return value.length ? value.join("، ") : "ثبت نشده";
  if (typeof value === "boolean") return value ? "تأیید شده" : "تأیید نشده";
  return value.trim() || "ثبت نشده";
}

function Heading({
  title,
  description,
  entityId,
}: {
  title: string;
  description: string;
  entityId?: string;
}) {
  const context = useSolverContext();
  return (
    <header className="rh-profile-heading">
      <div>
        <nav aria-label="مسیر صفحه">
          <Link href={buildSolverHref("/app/solver/dashboard", context)}>فضای کاری</Link>
          <span>/</span>
          <span>{title}</span>
        </nav>
        <h1>{title}</h1>
        <p>{description}</p>
        {entityId && (
          <small>
            <bdi dir="ltr">{entityId}</bdi>
          </small>
        )}
      </div>
    </header>
  );
}

function Notice({ value, onClose }: { value: string; onClose: () => void }) {
  if (!value) return null;
  return (
    <div className="rh-flow-toast" role="status">
      <Icon name="check" />
      <span>{value}</span>
      <span />
      <button type="button" onClick={onClose} aria-label="بستن پیام">
        <Icon name="close" />
      </button>
    </div>
  );
}

function setResult(result: MutationResult, success: string, setter: (value: string) => void) {
  setter(result.ok ? `${success} · رسید ${result.receiptId}` : result.message);
}

export function SolverNotifications() {
  const context = useSolverContext();
  const state = useStore();
  const [filter, setFilter] = useState<"all" | "unread" | "action">("all");
  const all = notificationsForWorkspace(context.workspaceId, state);
  const visible = all.filter(
    (item) => filter === "all" || (filter === "unread" ? !item.readAt : item.actionRequired),
  );
  const href = (deepLink: string) => buildSolverHref(deepLink.split("?")[0], context);
  return (
    <>
      <Heading
        title="پیام‌ها و اعلان‌ها"
        description="شمارنده، خوانده‌شدن و deep link هر اعلان به workspace دریافت‌کننده محدود است."
      />
      <div className="rh-proposal-tabs" role="tablist" aria-label="فیلتر اعلان‌ها">
        {[
          ["all", "همه"],
          ["unread", "خوانده‌نشده"],
          ["action", "نیازمند اقدام"],
        ].map(([value, label]) => (
          <button
            type="button"
            role="tab"
            aria-selected={filter === value}
            className={filter === value ? "is-active" : ""}
            key={value}
            onClick={() => setFilter(value as typeof filter)}
          >
            {label}
          </button>
        ))}
      </div>
      <section className="rh-card rh-membership-list">
        <header>
          <div>
            <h2>اعلان‌های این فضای کاری</h2>
            <p>
              {all.filter((item) => !item.readAt).length.toLocaleString("fa-IR")} اعلان خوانده‌نشده
            </p>
          </div>
          <button
            type="button"
            disabled={!all.some((item) => !item.readAt)}
            onClick={() => markNotificationRead(context.workspaceId)}
          >
            خواندن همه
          </button>
        </header>
        {visible.map((item) => (
          <article className={!item.readAt ? "is-unread" : ""} key={item.id}>
            <div>
              <small>
                {item.priority === "high" ? "مهم" : "اطلاع"} · {date(item.createdAt)}
              </small>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </div>
            <div className="rh-membership-actions">
              <Link
                href={href(item.deepLink)}
                onClick={() => markNotificationRead(context.workspaceId, item.id)}
              >
                مشاهده رکورد
              </Link>
              {!item.readAt && (
                <button
                  type="button"
                  onClick={() => markNotificationRead(context.workspaceId, item.id)}
                >
                  خوانده شد
                </button>
              )}
            </div>
          </article>
        ))}
        {!visible.length && (
          <div className="rh-profile-empty">
            <Icon name="notification" />
            <h2>{all.length ? "اعلانی با این فیلتر وجود ندارد" : "هنوز اعلانی ندارید"}</h2>
          </div>
        )}
      </section>
    </>
  );
}

export function SolverVerification() {
  const context = useSolverContext();
  const state = useStore();
  const record = state.verifications.find((item) => item.workspaceId === context.workspaceId);
  const [files, setFiles] = useState<Record<string, string>>({});
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [notice, setNotice] = useState("");
  if (!record)
    return (
      <section className="rh-card rh-profile-empty">
        <h1>پرونده احراز پیدا نشد</h1>
      </section>
    );
  const allowed =
    context.type === "individual" ||
    (() => {
      const membership = state.memberships.find((item) => item.id === context.membershipId);
      return Boolean(membership && ["owner", "admin"].includes(membership.role));
    })();
  return (
    <>
      <Heading
        title={context.type === "team" ? "احراز تیم" : "احراز هویت و تخصص"}
        description="آمادگی پروفایل و احراز دو وضعیت مستقل‌اند؛ هر مدرک evidence و دلیل اصلاح خودش را دارد."
        entityId={record.id}
      />
      <section className="rh-summary-grid rh-summary-grid--three">
        {[
          ["وضعیت پرونده", record.state, "shield"],
          ["آخرین تغییر", date(record.updatedAt), "history"],
          ["تعداد مدارک", record.documents.length, "brief"],
        ].map(([label, value, icon]) => (
          <article className="rh-card" key={String(label)}>
            <span>
              <Icon name={icon as "shield"} />
            </span>
            <div>
              <small>{label}</small>
              <strong>{typeof value === "number" ? value.toLocaleString("fa-IR") : value}</strong>
            </div>
          </article>
        ))}
      </section>
      {!allowed && (
        <aside className="rh-team-authority-note" role="status">
          <Icon name="lock" />
          <div>
            <h2>پرونده فقط‌خواندنی است</h2>
            <p>فقط مالک یا مدیر تیم می‌تواند مدارک تیم را اصلاح و ارسال کند.</p>
          </div>
        </aside>
      )}
      <section className="rh-card rh-verification-form">
        <h2>مدارک و نتیجه بررسی</h2>
        {record.documents.map((document) => {
          const progress = uploadProgress[document.id];
          const selectedFile = files[document.id];
          return (
            <article className="rh-verification-upload" key={document.id}>
              <Icon name={document.state === "verified" ? "check" : "download"} />
              <div>
                <strong>{document.label}</strong>
                <small>
                  {progress !== undefined && progress < 100
                    ? "در حال بارگذاری نمونه"
                    : `${document.state}${document.reason ? ` · ${document.reason}` : ""}`}
                </small>
                {progress !== undefined && (
                  <progress
                    aria-label={`پیشرفت بارگذاری ${document.label}`}
                    max={100}
                    value={progress}
                  >
                    {progress}%
                  </progress>
                )}
              </div>
              <b>
                <bdi dir="ltr">{selectedFile ?? document.fileName ?? "انتخاب فایل"}</bdi>
              </b>
              <label className="rh-profile-outline">
                {selectedFile ? "جایگزینی فایل" : "انتخاب فایل"}
                <input
                  aria-label={`انتخاب فایل ${document.label}`}
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg"
                  disabled={
                    !allowed ||
                    document.state === "verified" ||
                    (progress !== undefined && progress < 100)
                  }
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    if (!/\.(pdf|png|jpe?g)$/i.test(file.name) || file.size > 5 * 1024 * 1024) {
                      setNotice(
                        "فرمت فایل باید PDF، PNG یا JPG و حجم آن حداکثر ۵ مگابایت باشد. دوباره تلاش کنید.",
                      );
                      event.currentTarget.value = "";
                      return;
                    }
                    setUploadProgress((current) => ({ ...current, [document.id]: 25 }));
                    window.setTimeout(() => {
                      setFiles((current) => ({ ...current, [document.id]: file.name }));
                      setUploadProgress((current) => ({ ...current, [document.id]: 100 }));
                      setNotice("فایل نمونه با موفقیت آماده ارسال شد.");
                    }, 150);
                  }}
                />
              </label>
              {selectedFile && document.state !== "verified" && (
                <button
                  type="button"
                  disabled={!allowed}
                  onClick={() => {
                    setFiles((current) => {
                      const next = { ...current };
                      delete next[document.id];
                      return next;
                    });
                    setUploadProgress((current) => {
                      const next = { ...current };
                      delete next[document.id];
                      return next;
                    });
                  }}
                >
                  حذف فایل انتخابی
                </button>
              )}
            </article>
          );
        })}
        <button
          type="button"
          className="rh-profile-primary"
          disabled={!allowed || Object.values(uploadProgress).some((progress) => progress < 100)}
          onClick={() => {
            const names = record.documents
              .map((document) => files[document.id] ?? document.fileName ?? "")
              .filter(Boolean);
            setResult(
              submitVerification(context.workspaceId, names, context),
              "مدارک برای بررسی ارسال شد",
              setNotice,
            );
          }}
        >
          ارسال یا ارسال مجدد مدارک
        </button>
      </section>
      <Notice value={notice} onClose={() => setNotice("")} />
    </>
  );
}

export function SolverDataRoom() {
  const context = useSolverContext();
  const [state, setState] = useState(() => readSolverState());
  const [confirmed, setConfirmed] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const params =
    typeof window === "undefined"
      ? new URLSearchParams()
      : new URLSearchParams(
          (document.documentElement.dataset.challengeStandalone === "true"
            ? window.location.hash
            : window.location.search
          ).split("?")[1] ?? "",
        );
  const entityId = params.get("entity");
  const restricted = Object.values(challengeEligibilityRules).filter((rule) => rule.documentGate);
  if (!entityId)
    return (
      <>
        <Heading
          title="NDA و اتاق داده"
          description="برای هر فرصت محرمانه، دسترسی مستقل و workspace-scoped ثبت می‌شود."
        />
        <section className="rh-card rh-membership-list">
          {restricted.map((rule) => (
            <article key={rule.challengeId}>
              <div>
                <small>سند محرمانه فرصت</small>
                <h3>
                  <bdi dir="ltr">{rule.challengeId}</bdi>
                </h3>
                <p>قبل از پذیرش NDA فقط علت نیاز به دسترسی نمایش داده می‌شود.</p>
              </div>
              <Link
                href={buildSolverHref("/app/solver/data-room", context, {
                  entity: rule.challengeId,
                })}
              >
                بررسی شرایط دسترسی
              </Link>
            </article>
          ))}
        </section>
      </>
    );
  if (!challengeEligibilityRules[entityId]?.documentGate)
    return (
      <section className="rh-card rh-profile-empty">
        <Icon name="lock" />
        <h1>اتاق داده پیدا نشد</h1>
        <p>این شناسه سند محرمانه ثبت‌شده‌ای ندارد.</p>
      </section>
    );
  const access = canAccessRestrictedDocument(context.workspaceId, entityId, state);
  return (
    <>
      <Heading
        title="NDA و اتاق داده"
        description="metadata سند محرمانه فقط بعد از پذیرش نسخه NDA برای همین workspace به projection صفحه افزوده می‌شود."
        entityId={entityId}
      />
      {!access ? (
        <section className="rh-card rh-solver-flow-card">
          <h2>درخواست دسترسی محرمانه</h2>
          <p>
            این سند شامل داده فرایندی و نقشه تجهیز است. workspace درخواست‌کننده:{" "}
            <bdi dir="ltr">{context.workspaceId}</bdi>.
          </p>
          <div className="rh-team-origin-note">
            <Icon name="shield" />
            <div>
              <strong>NDA نسخه ۲</strong>
              <p>
                دسترسی فقط برای ارزیابی این فرصت است؛ بازنشر یا استفاده خارج از پرونده مجاز نیست.
              </p>
            </div>
          </div>
          <label className="rh-offer-response-consent">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            <span>متن و دامنه NDA نسخه ۲ را خواندم و از طرف workspace مجازم.</span>
          </label>
          <button
            type="button"
            className="rh-profile-primary"
            disabled={!confirmed}
            onClick={() => setConfirmOpen(true)}
          >
            پذیرش NDA و دریافت دسترسی
          </button>
        </section>
      ) : (
        <section className="rh-card rh-resume-card" role="status">
          <h2>اتاق داده در دسترس است</h2>
          <article>
            <span>PDF</span>
            <div>
              <strong>restricted-process-map-v2.pdf</strong>
              <small>۴٫۲ مگابایت · دسترسی محدود به {context.workspaceId}</small>
            </div>
          </article>
          <p>
            این نسخه مستقل دانلود واقعی ندارد؛ ردیف فایل صادقانه و بدون لینک جعلی نمایش داده شده
            است.
          </p>
        </section>
      )}
      <ConfirmDialog
        open={confirmOpen}
        title="پذیرش NDA نسخه ۲؟"
        description={`پذیرش برای ${context.workspaceId} ثبت می‌شود و به فضای کاری دیگری منتقل نخواهد شد.`}
        confirmLabel="تأیید و فعال‌کردن دسترسی"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          const result = acceptNda(
            context,
            entityId,
            "NDA-2",
            `nda:${context.workspaceId}:${entityId}:2`,
          );
          setResult(result, "NDA پذیرفته و دسترسی فعال شد", setNotice);
          setState(readSolverState());
          setConfirmOpen(false);
        }}
      />
      <Notice value={notice} onClose={() => setNotice("")} />
    </>
  );
}

function caseIdFrom(path: string) {
  return path.match(/^\/app\/solver\/cases\/([^/]+)/)?.[1];
}

function CaseNav({ caseRecord }: { caseRecord: CaseRecord }) {
  const context = useSolverContext();
  return (
    <nav className="rh-proposal-tabs" aria-label="بخش‌های پرونده همکاری">
      {[
        ["", "نمای کلی"],
        ["messages", "پیام‌ها"],
        ["pilot", "پایلوت و تحویل"],
        ["payments", "پرداخت"],
        ["contract", "قرارداد"],
      ].map(([suffix, label]) => (
        <Link
          key={suffix}
          href={buildSolverHref(
            `/app/solver/cases/${caseRecord.id}${suffix ? `/${suffix}` : ""}`,
            context,
          )}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

export function SolverCases({ route }: { route: InternalRoute }) {
  const context = useSolverContext();
  const state = useStore();
  const cases = state.cases.filter((item) => item.ownerWorkspaceId === context.workspaceId);
  const requested = caseIdFrom(route.path);
  const caseRecord = requested ? cases.find((item) => item.id === requested) : undefined;
  if (requested && !caseRecord)
    return (
      <section className="rh-card rh-profile-empty">
        <Icon name="lock" />
        <h1>پرونده پیدا نشد یا به این workspace تعلق ندارد</h1>
      </section>
    );
  if (!caseRecord)
    return (
      <>
        <Heading
          title="پرونده‌های همکاری"
          description="هر پرونده فقط پس از selected شدن proposal و برای ownerWorkspaceId همان پیشنهاد ساخته می‌شود."
        />
        <section className="rh-saved-grid">
          {cases.map((item) => (
            <article className="rh-card rh-saved-card" key={item.id}>
              <header>
                <span className="rh-saved-card__logo">
                  <Icon name="brief" />
                </span>
                <div>
                  <small>
                    <bdi dir="ltr">{item.id}</bdi>
                  </small>
                  <h2>پرونده پیشنهاد {item.proposalId}</h2>
                  <p>{item.state}</p>
                </div>
              </header>
              <footer>
                <Link href={buildSolverHref(`/app/solver/cases/${item.id}`, context)}>
                  بازکردن هاب پرونده
                </Link>
              </footer>
            </article>
          ))}
          {!cases.length && (
            <section className="rh-card rh-profile-empty">
              <h2>پرونده همکاری در این فضا وجود ندارد</h2>
            </section>
          )}
        </section>
      </>
    );
  if (route.path.endsWith("/messages")) return <CaseMessages record={caseRecord} />;
  if (route.path.endsWith("/pilot")) return <CasePilot record={caseRecord} />;
  if (route.path.endsWith("/payments")) return <CasePayments record={caseRecord} state={state} />;
  if (route.path.endsWith("/contract")) return <CaseContract record={caseRecord} state={state} />;
  return <CaseOverview record={caseRecord} />;
}

function CaseOverview({ record }: { record: CaseRecord }) {
  const context = useSolverContext();
  const [outcome, setOutcome] = useState("");
  const [comment, setComment] = useState("");
  const [notice, setNotice] = useState("");
  const [closeConfirm, setCloseConfirm] = useState(false);
  const state = useStore();
  const closePermission = teamPermission(context, "approve-contract", {}, state);
  return (
    <>
      <Heading
        title="هاب پرونده همکاری"
        description="proposal، قرارداد، پیام، پایلوت، تحویل و پرداخت زیر یک caseId پیگیری می‌شوند."
        entityId={record.id}
      />
      <CaseNav caseRecord={record} />
      <section className="rh-summary-grid">
        {[
          ["وضعیت پرونده", record.state, "brief"],
          ["وضعیت پایلوت", record.pilot.state, "trend"],
          [
            "تحویل‌ها",
            `${record.deliverables.filter((item) => item.state === "accepted").length}/${record.deliverables.length}`,
            "check",
          ],
          [
            "پرداخت‌شده",
            money(
              record.payments
                .filter((item) => item.state === "paid")
                .reduce((sum, item) => sum + item.amount, 0),
            ),
            "shield",
          ],
        ].map(([label, value, icon]) => (
          <article className="rh-card" key={String(label)}>
            <span>
              <Icon name={icon as "brief"} />
            </span>
            <div>
              <small>{label}</small>
              <strong>{value}</strong>
            </div>
          </article>
        ))}
      </section>
      <section className="rh-card rh-solver-flow-card">
        <h2>خلاصه ارتباط رکوردها</h2>
        <p>
          پیشنهاد <bdi dir="ltr">{record.proposalId}</bdi> → قرارداد{" "}
          <bdi dir="ltr">{record.contractId}</bdi> → پایلوت <bdi dir="ltr">{record.pilot.id}</bdi>
        </p>
        {record.state === "completed" && (
          <button
            type="button"
            className="rh-profile-primary"
            disabled={!closePermission.allowed}
            title={closePermission.allowed ? undefined : closePermission.reason}
            onClick={() => setCloseConfirm(true)}
          >
            بستن پرونده و صدور رسید
          </button>
        )}
        {record.state === "closed" && (
          <p role="status">پرونده در {date(record.closedAt)} بسته شده و فقط‌خواندنی است.</p>
        )}
      </section>
      {["completed", "closed"].includes(record.state) && (
        <section className="rh-card rh-team-setup-form">
          <h2>بازخورد پایان همکاری</h2>
          {record.feedback ? (
            <p role="status">بازخورد این پرونده قبلاً ثبت شده است: {record.feedback.outcome}</p>
          ) : (
            <>
              <label>
                نتیجه همکاری
                <input value={outcome} onChange={(event) => setOutcome(event.target.value)} />
              </label>
              <label>
                توضیح
                <textarea value={comment} onChange={(event) => setComment(event.target.value)} />
              </label>
              <button
                type="button"
                onClick={() =>
                  setResult(
                    submitCaseFeedback(context, record.id, outcome, comment),
                    "بازخورد یک‌بار ثبت شد",
                    setNotice,
                  )
                }
              >
                ثبت بازخورد
              </button>
            </>
          )}
        </section>
      )}
      <ConfirmDialog
        open={closeConfirm}
        title="بستن نهایی پرونده؟"
        description="پذیرش همه تحویل‌ها، تسویه پرداخت‌ها و قرارداد مؤثر دوباره بررسی و رسید closure ثبت می‌شود."
        confirmLabel="بستن پرونده"
        onCancel={() => setCloseConfirm(false)}
        onConfirm={() => {
          setResult(
            closeCase(context, record.id, `close:${context.workspaceId}:${record.id}`),
            "پرونده بسته شد",
            setNotice,
          );
          setCloseConfirm(false);
        }}
      />
      <Notice value={notice} onClose={() => setNotice("")} />
    </>
  );
}

function CaseMessages({ record }: { record: CaseRecord }) {
  const context = useSolverContext();
  const state = useStore();
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  const membership =
    context.type === "team"
      ? state.memberships.find((item) => item.id === context.membershipId)
      : undefined;
  const decision = teamPermission(
    context,
    "view-case-messages",
    { assigned: membership?.assignedCaseIds.includes(record.id) },
    state,
  );
  if (!decision.allowed)
    return (
      <>
        <Heading
          title="پیام‌های پرونده"
          description="دسترسی پیام به نقش و assignment وابسته است."
          entityId={record.id}
        />
        <section className="rh-card rh-profile-empty">
          <Icon name="lock" />
          <h2>دسترسی به پیام‌ها ندارید</h2>
          <p>{decision.reason}</p>
        </section>
      </>
    );
  const readOnly = membership?.role === "viewer";
  return (
    <>
      <Heading
        title="پیام‌های پرونده"
        description="thread به case وابسته است و پیام mock پس از refresh باقی می‌ماند."
        entityId={record.id}
      />
      <CaseNav caseRecord={record} />
      <section className="rh-card rh-message-thread">
        <div className="rh-message-list">
          {record.messages.map((item) => (
            <p className={item.actorUserId === state.currentUser.id ? "is-mine" : ""} key={item.id}>
              {item.body}
              <small>{date(item.createdAt)}</small>
            </p>
          ))}
        </div>
        <footer>
          <label>
            <span className="sr-only">متن پیام</span>
            <textarea
              value={message}
              disabled={readOnly}
              onChange={(event) => setMessage(event.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={readOnly}
            title={readOnly ? "مشاهده‌گر فقط اجازه مطالعه دارد." : undefined}
            onClick={() => {
              const result = sendCaseMessage(context, record.id, message);
              setResult(result, "پیام ارسال شد", setNotice);
              if (result.ok) setMessage("");
            }}
          >
            ارسال پیام
          </button>
        </footer>
      </section>
      <Notice value={notice} onClose={() => setNotice("")} />
    </>
  );
}

function CasePilot({ record }: { record: CaseRecord }) {
  const context = useSolverContext();
  const [notice, setNotice] = useState("");
  const [uploading, setUploading] = useState<string>();
  return (
    <>
      <Heading
        title="پایلوت و تحویل‌دادنی‌ها"
        description="وظیفه، owner، فایل نمونه و history از Case repository می‌آیند."
        entityId={record.pilot.id}
      />
      <CaseNav caseRecord={record} />
      <section className="rh-card rh-membership-list">
        <header>
          <div>
            <h2>وظایف پایلوت</h2>
            <p>وضعیت: {record.pilot.state}</p>
          </div>
        </header>
        {record.pilot.tasks.map((task) => (
          <article key={task.id}>
            <div>
              <h3>{task.title}</h3>
              <p>
                مسئول: <bdi dir="ltr">{task.ownerId}</bdi>
              </p>
            </div>
            <label>
              <input
                type="checkbox"
                checked={task.done}
                onChange={(event) =>
                  setResult(
                    updatePilotTask(context, record.id, task.id, event.target.checked),
                    "وضعیت وظیفه ثبت شد",
                    setNotice,
                  )
                }
              />{" "}
              انجام شد
            </label>
          </article>
        ))}
      </section>
      <section className="rh-card rh-membership-list">
        <header>
          <div>
            <h2>تحویل‌دادنی‌ها</h2>
            <p>نسخه accepted فقط‌خواندنی است.</p>
          </div>
        </header>
        {record.deliverables.map((item) => (
          <article key={item.id}>
            <div>
              <h3>{item.title}</h3>
              <p>
                {item.state}{" "}
                {item.fileName && (
                  <>
                    · <bdi dir="ltr">{item.fileName}</bdi>
                  </>
                )}
              </p>
            </div>
            {["draft", "revision", "rejected"].includes(item.state) && (
              <label className="rh-profile-outline">
                {uploading === item.id ? "در حال بارگذاری…" : "انتخاب PDF"}
                <input
                  type="file"
                  accept=".pdf"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    setUploading(item.id);
                    window.setTimeout(() => {
                      setResult(
                        submitDeliverable(context, record.id, item.id, file.name),
                        "تحویل‌دادنی ارسال شد",
                        setNotice,
                      );
                      setUploading(undefined);
                    }, 150);
                  }}
                />
              </label>
            )}
          </article>
        ))}
      </section>
      <Notice value={notice} onClose={() => setNotice("")} />
    </>
  );
}

function CasePayments({ record, state }: { record: CaseRecord; state: SolverState }) {
  const context = useSolverContext();
  const permission = teamPermission(context, "view-payments", {}, state);
  if (!permission.allowed)
    return (
      <>
        <Heading
          title="پرداخت‌های پرونده"
          description="اطلاعات مالی بر اساس role و policy تیم محدود است."
          entityId={record.id}
        />
        <section className="rh-card rh-profile-empty">
          <Icon name="lock" />
          <h2>اطلاعات مالی قابل مشاهده نیست</h2>
          <p>{permission.reason}</p>
        </section>
      </>
    );
  return (
    <>
      <Heading
        title="پرداخت‌های پرونده"
        description="جمع‌ها از milestoneهای canonical محاسبه می‌شوند و ردیف رسید فقط در صورت وجود شناسه واقعی نمایش داده می‌شود."
        entityId={record.id}
      />
      <CaseNav caseRecord={record} />
      <section className="rh-summary-grid rh-summary-grid--three">
        {[
          ["کل مراحل", money(record.payments.reduce((sum, item) => sum + item.amount, 0))],
          [
            "پرداخت‌شده",
            money(
              record.payments
                .filter((item) => item.state === "paid")
                .reduce((sum, item) => sum + item.amount, 0),
            ),
          ],
          [
            "باز",
            record.payments.filter((item) => item.state !== "paid").length.toLocaleString("fa-IR"),
          ],
        ].map(([label, value]) => (
          <article className="rh-card" key={label}>
            <div>
              <small>{label}</small>
              <strong>{value}</strong>
            </div>
          </article>
        ))}
      </section>
      <section className="rh-card rh-membership-list">
        {record.payments.map((payment) => (
          <article key={payment.id}>
            <div>
              <small>
                <bdi dir="ltr">{payment.id}</bdi>
              </small>
              <h3>{payment.milestone}</h3>
              <p>
                {money(payment.amount)} · {payment.state}
              </p>
            </div>
            {payment.receiptId ? (
              <div className="rh-resume-card">
                <strong>رسید نمونه</strong>
                <bdi dir="ltr">{payment.receiptId}</bdi>
                <small>فایل دانلودی در نسخه مستقل تولید نشده است.</small>
              </div>
            ) : (
              <span>رسیدی هنوز صادر نشده است</span>
            )}
          </article>
        ))}
      </section>
    </>
  );
}

function CaseContract({ record, state }: { record: CaseRecord; state: SolverState }) {
  const context = useSolverContext();
  const contract = state.contracts.find(
    (item) => item.id === record.contractId && item.ownerWorkspaceId === context.workspaceId,
  );
  const [notice, setNotice] = useState("");
  const [confirm, setConfirm] = useState<"version" | "approve" | "sign">();
  if (!contract)
    return (
      <section className="rh-card rh-profile-empty">
        <h1>قرارداد پیدا نشد</h1>
      </section>
    );
  const permission = teamPermission(context, "approve-contract", {}, state);
  return (
    <>
      <Heading
        title="قرارداد پرونده"
        description="نسخه، proposal مبنا، approval و امضا در Contract Entity مستقل ثبت می‌شوند."
        entityId={contract.id}
      />
      <CaseNav caseRecord={record} />
      <section className="rh-card rh-solver-flow-card">
        <h2>
          نسخه {contract.version.toLocaleString("fa-IR")} · {contract.state}
        </h2>
        <dl>
          <div>
            <dt>پیشنهاد مبنا</dt>
            <dd>
              <bdi dir="ltr">
                {contract.proposalId} / {contract.proposalVersionId}
              </bdi>
            </dd>
          </div>
          <div>
            <dt>مبلغ</dt>
            <dd>{money(contract.amount)}</dd>
          </div>
          <div>
            <dt>دامنه</dt>
            <dd>{contract.scope}</dd>
          </div>
          <div>
            <dt>مالکیت فکری</dt>
            <dd>{contract.ipTerms}</dd>
          </div>
          <div>
            <dt>محرمانگی</dt>
            <dd>{contract.confidentiality}</dd>
          </div>
          <div>
            <dt>تأییدهای نسخه جاری</dt>
            <dd>
              {contract.approvals
                .filter((item) => item.version === contract.version)
                .length.toLocaleString("fa-IR")}
            </dd>
          </div>
          <div>
            <dt>زمان امضا</dt>
            <dd>{date(contract.signedAt)}</dd>
          </div>
        </dl>
        <div className="rh-profile-actions">
          <button
            type="button"
            disabled={!permission.allowed}
            title={permission.allowed ? undefined : permission.reason}
            onClick={() => setConfirm("version")}
          >
            ایجاد نسخه مذاکره جدید
          </button>
          <button
            type="button"
            className="rh-profile-primary"
            disabled={!permission.allowed || !["negotiation", "approval"].includes(contract.state)}
            title={permission.allowed ? undefined : permission.reason}
            onClick={() => setConfirm("approve")}
          >
            تأیید نسخه جاری
          </button>
          <button
            type="button"
            className="rh-profile-primary"
            disabled={!permission.allowed || contract.state !== "signature"}
            title={permission.allowed ? undefined : permission.reason}
            onClick={() => setConfirm("sign")}
          >
            امضای نسخه تأییدشده
          </button>
        </div>
      </section>
      <ConfirmDialog
        open={Boolean(confirm)}
        title={
          confirm === "version"
            ? "ایجاد نسخه جدید قرارداد؟"
            : confirm === "sign"
              ? "امضای نسخه تأییدشده؟"
              : "تأیید نسخه جاری قرارداد؟"
        }
        description={
          confirm === "version"
            ? "تأییدهای نسخه قبل نامعتبر و فهرست approvalها خالی می‌شود."
            : confirm === "sign"
              ? "امضا با actor، نسخه، زمان و رسید ثبت و قرارداد مؤثر می‌شود."
              : "این تأیید با actor، نسخه و receipt ثبت می‌شود."
        }
        confirmLabel="تأیید اقدام"
        onCancel={() => setConfirm(undefined)}
        onConfirm={() => {
          const result =
            confirm === "version"
              ? createContractVersion(context, contract.id)
              : confirm === "sign"
                ? signContract(
                    context,
                    contract.id,
                    `sign:${context.workspaceId}:${contract.id}:v${contract.version}`,
                  )
                : approveContract(context, contract.id);
          setResult(
            result,
            confirm === "version"
              ? "نسخه جدید ساخته شد"
              : confirm === "sign"
                ? "قرارداد امضا و مؤثر شد"
                : "نسخه قرارداد تأیید شد",
            setNotice,
          );
          setConfirm(undefined);
        }}
      />
      <Notice value={notice} onClose={() => setNotice("")} />
    </>
  );
}

export function SolverProposalVersions({ route }: { route: InternalRoute }) {
  const context = useSolverContext();
  const state = useStore();
  const proposalId = route.path.match(/^\/app\/solver\/proposals\/([^/]+)\/versions$/)?.[1];
  const proposal = state.proposals.find(
    (item) => item.id === proposalId && item.ownerWorkspaceId === context.workspaceId,
  );
  const versions = state.proposalVersions
    .filter((item) => item.proposalId === proposal?.id)
    .sort((a, b) => b.number - a.number);
  const current =
    versions.find((version) => version.id === proposal?.currentVersionId) ?? versions[0];
  const [selectedVersionId, setSelectedVersionId] = useState(() => versions.at(-1)?.id ?? "");
  const [auditExpanded, setAuditExpanded] = useState(false);
  useEffect(() => {
    if (versions.length && !versions.some((version) => version.id === selectedVersionId)) {
      setSelectedVersionId(versions.at(-1)?.id ?? "");
    }
  }, [selectedVersionId, versions]);
  if (!proposal || !current)
    return (
      <section className="rh-card rh-profile-empty">
        <h1>تاریخچه پیشنهاد پیدا نشد</h1>
      </section>
    );
  const selected =
    versions.find((version) => version.id === selectedVersionId) ?? versions.at(-1) ?? current;
  const changedFields = (Object.keys(current.content) as Array<keyof ProposalContent>).filter(
    (field) => JSON.stringify(selected.content[field]) !== JSON.stringify(current.content[field]),
  );
  const currentActor =
    state.users.find((user) => user.id === current.actorUserId)?.displayName ?? current.actorUserId;
  const selectedActor =
    state.users.find((user) => user.id === selected.actorUserId)?.displayName ??
    selected.actorUserId;

  return (
    <div className="rh-version-history-page">
      <header className="rh-version-history-heading">
        <div>
          <nav aria-label="مسیر صفحه">
            <Link href={buildSolverHref("/app/solver/proposals", context)}>پیشنهادهای من</Link>
            <span>/</span>
            <Link href={buildSolverHref(`/app/solver/proposals/${proposal.id}/preview`, context)}>
              <bdi dir="ltr">{proposal.id}</bdi>
            </Link>
            <span>/</span>
            <span>نسخه‌ها</span>
          </nav>
          <h1>تاریخچه نسخه‌های پیشنهاد</h1>
          <p>
            مشاهده تغییرات، مقایسه نسخه‌ها و سوابق ثبت برای <bdi dir="ltr">{proposal.id}</bdi>
          </p>
        </div>
        <div className="rh-version-history-heading__actions">
          <Link
            className="is-primary"
            href={buildSolverHref(`/app/solver/proposals/${proposal.id}/preview`, context)}
          >
            مشاهده نسخه جاری
          </Link>
          <Link href={buildSolverHref(`/app/solver/proposals/${proposal.id}/preview`, context)}>
            <Icon name="arrow" /> بازگشت به پیش‌نمایش
          </Link>
        </div>
      </header>

      <section className="rh-card rh-version-history-summary" aria-label="خلاصه تاریخچه نسخه‌ها">
        <article>
          <Icon name="brief" />
          <span>نسخه جاری</span>
          <strong>نسخه {current.number.toLocaleString("fa-IR")}</strong>
        </article>
        <article>
          <Icon name="decision" />
          <span>نسخه ثبت‌شده</span>
          <strong>{versions.length.toLocaleString("fa-IR")}</strong>
        </article>
        <article>
          <Icon name="history" />
          <span>آخرین تغییر</span>
          <strong>{date(current.createdAt)}</strong>
        </article>
        <article>
          <Icon name="shield" />
          <strong>ثبت خودکار سوابق</strong>
        </article>
      </section>

      <div className="rh-version-history-layout">
        <aside className="rh-card rh-version-timeline" aria-label="فهرست نسخه‌ها">
          <h2>نسخه‌ها</h2>
          {versions.map((version) => {
            const isCurrent = version.id === current.id;
            const isSelected = version.id === selected.id && !isCurrent;
            const actor =
              state.users.find((user) => user.id === version.actorUserId)?.displayName ??
              version.actorUserId;
            return (
              <article
                className={`${isCurrent ? "is-current" : ""} ${isSelected ? "is-selected" : ""}`.trim()}
                key={version.id}
              >
                <i aria-hidden="true" />
                {isCurrent && <span>جاری</span>}
                <strong>نسخه {version.number.toLocaleString("fa-IR")}</strong>
                <small>{actor}</small>
                <small>{date(version.createdAt)}</small>
                {!isCurrent && (
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => setSelectedVersionId(version.id)}
                  >
                    {isSelected ? "در حال مقایسه" : "مقایسه با جاری"}
                  </button>
                )}
              </article>
            );
          })}
          <p>
            <Icon name="lock" /> نسخه‌های قفل‌شده فقط قابل مشاهده‌اند.
          </p>
        </aside>

        <section className="rh-card rh-version-comparison">
          <header>
            <h2>
              مقایسه نسخه {selected.number.toLocaleString("fa-IR")} با نسخه جاری{" "}
              {current.number.toLocaleString("fa-IR")}
            </h2>
            <div className="rh-version-comparison__toolbar">
              <select
                aria-label="نسخه مبنا برای مقایسه"
                value={selected.id}
                onChange={(event) => setSelectedVersionId(event.target.value)}
              >
                {versions
                  .filter((version) => version.id !== current.id)
                  .map((version) => (
                    <option value={version.id} key={version.id}>
                      نسخه {version.number.toLocaleString("fa-IR")}
                    </option>
                  ))}
                {versions.length === 1 && (
                  <option value={current.id}>نسخه {current.number.toLocaleString("fa-IR")}</option>
                )}
              </select>
              <Icon name="arrow" />
              <select aria-label="نسخه جاری" value={current.id} disabled>
                <option value={current.id}>
                  نسخه جاری {current.number.toLocaleString("fa-IR")}
                </option>
              </select>
              <button
                type="button"
                disabled={versions.length < 2}
                onClick={() => setSelectedVersionId(versions.at(-1)?.id ?? current.id)}
              >
                اولین نسخه
              </button>
              <span>{changedFields.length.toLocaleString("fa-IR")} تغییر واقعی</span>
            </div>
          </header>

          <div className="rh-version-comparison__rows" aria-label="فیلدهای تغییرکرده">
            {changedFields.map((field, index) => {
              const before = proposalValue(selected.content[field]);
              const after = proposalValue(current.content[field]);
              const added = before === "ثبت نشده" && after !== "ثبت نشده";
              return (
                <article className={added ? "is-added" : ""} key={field}>
                  <div className="rh-version-comparison__title">
                    <span>{String.fromCharCode(65 + (index % 26))}</span>
                    <Icon
                      name={
                        field === "risks" || field === "mitigation"
                          ? "shield"
                          : field.includes("Weeks") || field === "roadmap"
                            ? "history"
                            : "brief"
                      }
                    />
                    <strong>{proposalFieldLabels[field]}</strong>
                    <small>{added ? "افزوده شده" : "تغییر یافته"}</small>
                  </div>
                  <div className="rh-version-comparison__values">
                    <div>
                      <small>قبل · نسخه {selected.number.toLocaleString("fa-IR")}</small>
                      <strong>{before}</strong>
                    </div>
                    <Icon name="arrow" />
                    <div>
                      <small>بعد · نسخه {current.number.toLocaleString("fa-IR")}</small>
                      <strong>{after}</strong>
                    </div>
                    <p>
                      {proposalFieldLabels[field]} در نسخه جاری با مقدار ثبت‌شده جدید قفل شده است.
                    </p>
                  </div>
                </article>
              );
            })}
            {!changedFields.length && (
              <article>
                <div className="rh-version-comparison__title">
                  <span>—</span>
                  <Icon name="check" />
                  <strong>تغییری وجود ندارد</strong>
                  <small>یکسان</small>
                </div>
                <div className="rh-version-comparison__values">
                  <p>دو نسخه انتخاب‌شده در محتوای canonical تفاوتی ندارند.</p>
                </div>
              </article>
            )}
          </div>

          <footer>
            <Icon name="shield" />
            <p>
              تاریخ، نویسنده و خلاصه هر تغییر ثبت می‌شود؛ نسخه‌های قبلی قابل ویرایش نیستند.
              {auditExpanded &&
                ` نسخه مبنا توسط ${selectedActor} و نسخه جاری توسط ${currentActor} ثبت شده است.`}
            </p>
            <button
              type="button"
              aria-expanded={auditExpanded}
              onClick={() => setAuditExpanded((value) => !value)}
            >
              {auditExpanded ? "بستن جزئیات ثبت" : "مشاهده جزئیات ثبت"} <Icon name="eye" />
            </button>
          </footer>
        </section>
      </div>
    </div>
  );
}

export function shouldUseCanonicalContinuity(route: InternalRoute) {
  return (
    route.experience === "notifications" ||
    route.experience === "case-hub" ||
    route.experience === "verification" ||
    route.experience === "data-room" ||
    route.experience === "contract" ||
    route.experience === "pilot" ||
    route.experience === "finance" ||
    route.experience === "conversations" ||
    route.experience === "audit" ||
    route.experience === "reputation"
  );
}

export function SolverCanonicalContinuity({ route }: { route: InternalRoute }) {
  if (route.experience === "notifications") return <SolverNotifications />;
  if (route.experience === "verification") return <SolverVerification />;
  if (route.experience === "data-room") return <SolverDataRoom />;
  if (route.experience === "audit" && route.path.includes("/proposals/"))
    return <SolverProposalVersions route={route} />;
  if (route.experience === "reputation")
    return <SolverCases route={{ ...route, path: "/app/solver/cases" }} />;
  if (
    ["case-hub", "contract", "pilot", "finance", "conversations"].includes(route.experience) &&
    route.path.startsWith("/app/solver/cases")
  )
    return <SolverCases route={route} />;
  if (["contract", "pilot", "finance", "conversations"].includes(route.experience))
    return <SolverCases route={{ ...route, path: "/app/solver/cases" }} />;
  return null;
}
