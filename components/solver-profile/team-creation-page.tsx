"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { PageHeading } from "@/components/solver-profile/shared";
import { TeamMemberDiscoveryPage } from "@/components/solver-profile/team-discovery-page";
import { useSolverContext, type SolverSpace } from "@/components/solver-shell";
import { challenges } from "@/data/mock";
import type { TeamType } from "@/domain/solver";
import { buildSolverHref } from "@/lib/solver/context";
import {
  readTeamCreationDraft,
  removeSolverUiValue,
  writeTeamCreationDraft,
} from "@/lib/solver/ui-preferences";
import {
  activeWorkspaces,
  createTeam as createSolverTeam,
  readSolverState,
} from "@/lib/solver/repository";

type TeamCreationDraft = {
  name: string;
  focus: string;
  type: string;
  maturity: string;
  objective: string;
  targetChallenge: string;
  requiredRole: string;
  skills: string;
  collaboration: string;
  location: string;
  publicContact: string;
  initialInviteEmail: string;
  proposalManagersCanSubmit: boolean;
  approvalBeforeSubmit: boolean;
};

const emptyTeamCreationDraft: TeamCreationDraft = {
  name: "",
  focus: "",
  type: "",
  maturity: "",
  objective: "",
  targetChallenge: "",
  requiredRole: "",
  skills: "",
  collaboration: "",
  location: "",
  publicContact: "",
  initialInviteEmail: "",
  proposalManagersCanSubmit: true,
  approvalBeforeSubmit: false,
};

function IndividualTeamCreationPage() {
  const context = useSolverContext();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [draft, setDraft] = useState(emptyTeamCreationDraft);
  const [error, setError] = useState("");
  const [created, setCreated] = useState(false);
  const [createdTeamId, setCreatedTeamId] = useState("");
  const [receiptId, setReceiptId] = useState("");

  useEffect(() => {
    setDraft((current) => ({
      ...current,
      ...readTeamCreationDraft<Partial<TeamCreationDraft>>({}),
    }));
  }, []);

  const update = <K extends keyof TeamCreationDraft>(field: K, value: TeamCreationDraft[K]) => {
    setDraft((current) => {
      const next = { ...current, [field]: value };
      writeTeamCreationDraft(next);
      return next;
    });
    setError("");
  };

  const continueSetup = () => {
    if (draft.name.trim().length < 3) {
      setError("نام تیم باید حداقل ۳ کاراکتر باشد.");
      return;
    }
    if (!draft.focus) {
      setError("حوزه اصلی فعالیت تیم را انتخاب کنید.");
      return;
    }
    if (!draft.type) {
      setError("نوع تیمی را که می‌خواهید بسازید انتخاب کنید.");
      return;
    }
    if (!draft.maturity) {
      setError("مرحله فعلی شکل‌گیری تیم را انتخاب کنید.");
      return;
    }
    if (draft.objective.trim().length < 20) {
      setError("هدف تیم را روشن و حداقل در ۲۰ کاراکتر توضیح دهید.");
      return;
    }
    setStep(2);
  };

  const createTeam = () => {
    if (!draft.requiredRole) {
      setError("اولین نقش موردنیاز تیم را انتخاب کنید.");
      return;
    }
    if (draft.skills.trim().length < 5) {
      setError("حداقل یک مهارت کلیدی موردنیاز را وارد کنید.");
      return;
    }
    if (!draft.collaboration) {
      setError("شیوه همکاری موردنظر تیم را انتخاب کنید.");
      return;
    }
    if (draft.location.trim().length < 2) {
      setError("شهر یا عبارت «دورکار» را برای محل همکاری وارد کنید.");
      return;
    }
    if (draft.publicContact && !/^\S+@\S+\.\S+$/.test(draft.publicContact)) {
      setError("ایمیل عمومی تیم معتبر نیست.");
      return;
    }
    if (draft.initialInviteEmail && !/^\S+@\S+\.\S+$/.test(draft.initialInviteEmail)) {
      setError("ایمیل دعوت اولیه معتبر نیست.");
      return;
    }
    const teamType: TeamType =
      draft.type === "تیم دانشگاهی"
        ? "academic-group"
        : draft.type === "آزمایشگاه"
          ? "lab"
          : draft.type === "شرکت رسمی"
            ? "company"
            : "expert-team";
    const result = createSolverTeam({
      name: draft.name,
      teamType,
      introduction: draft.objective,
      expertise: draft.skills
        .split(/[،,]/)
        .map((item) => item.trim())
        .filter(Boolean),
      publicContact: draft.publicContact || "team-contact@example.test",
      initialInviteEmail: draft.initialInviteEmail || undefined,
      policy: {
        proposalManagersCanSubmit: draft.proposalManagersCanSubmit,
        approvalBeforeSubmit: draft.approvalBeforeSubmit,
      },
    });
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setCreatedTeamId(result.entityId);
    setReceiptId(result.receiptId);
    removeSolverUiValue("team-creation-draft");
    setCreated(true);
    setError("");
  };

  if (created) {
    return (
      <>
        <PageHeading
          title="فضای تیم آماده شد"
          description="مشخصات اولیه ثبت شد؛ اکنون می‌توانید اعضا را متناسب با نقش‌های موردنیاز دعوت کنید."
        />
        <section className="rh-card rh-team-created" role="status">
          <span>
            <Icon name="check" />
          </span>
          <div>
            <small>تیم جدید</small>
            <h2>{draft.name}</h2>
            <p>
              شناسه تیم: <bdi dir="ltr">{createdTeamId}</bdi> · رسید:{" "}
              <bdi dir="ltr">{receiptId}</bdi>
            </p>
            <p>{draft.objective}</p>
            <dl>
              <div>
                <dt>حوزه فعالیت</dt>
                <dd>{draft.focus}</dd>
              </div>
              <div>
                <dt>مرحله تیم</dt>
                <dd>{draft.maturity}</dd>
              </div>
              <div>
                <dt>اولین نقش موردنیاز</dt>
                <dd>{draft.requiredRole}</dd>
              </div>
            </dl>
          </div>
          <footer>
            <Link
              className="rh-profile-primary"
              href={(() => {
                const createdContext = activeWorkspaces(readSolverState()).find(
                  (workspace) => workspace.type === "team" && workspace.teamId === createdTeamId,
                );
                return createdContext
                  ? buildSolverHref("/app/solver/team-building", createdContext)
                  : buildSolverHref("/app/solver/dashboard", context);
              })()}
            >
              ورود به فضای تیم و جذب عضو
            </Link>
            <Link
              className="rh-profile-outline"
              href={buildSolverHref("/app/solver/teams", {
                type: "individual",
                workspaceId: readSolverState().personalWorkspace.id,
              })}
            >
              مشاهده تیم‌های من
            </Link>
          </footer>
        </section>
      </>
    );
  }

  return (
    <>
      <PageHeading
        title="ساخت تیم جدید"
        description="ابتدا مأموریت و نیازهای تیم را تعریف کنید؛ سپس فضای مستقل تیم ساخته می‌شود و می‌توانید اعضا را دعوت کنید."
        action={
          <Link className="rh-profile-outline" href={buildSolverHref("/app/solver/teams", context)}>
            تیم‌های من
          </Link>
        }
      />
      <aside className="rh-team-origin-note">
        <Icon name="people" />
        <div>
          <strong>شما هنوز در فضای شخصی هستید</strong>
          <p>
            ساخت تیم، حساب شخصی شما را تغییر نمی‌دهد؛ یک فضای تیمی جدا با نقش مالک برای شما ایجاد
            می‌کند.
          </p>
        </div>
      </aside>
      <ol className="rh-team-setup-steps" aria-label={`مرحله ${step.toLocaleString("fa-IR")} از ۳`}>
        <li className={step >= 1 ? "is-active" : ""}>
          <b>۱</b>
          <span>
            تعریف تیم<small>هویت، هدف و مرحله تیم</small>
          </span>
        </li>
        <li className={step === 2 ? "is-active" : ""}>
          <b>۲</b>
          <span>
            نیاز اعضا<small>نقش، مهارت و شیوه همکاری</small>
          </span>
        </li>
        <li className={step === 3 ? "is-active" : ""}>
          <b>۳</b>
          <span>
            سیاست و پیش‌نمایش<small>اختیار ارسال و دعوت اولیه</small>
          </span>
        </li>
      </ol>
      <div className="rh-team-setup-layout">
        <section className="rh-card rh-team-setup-form">
          {step === 1 ? (
            <>
              <header>
                <span>
                  <Icon name="brief" />
                </span>
                <div>
                  <h2>تیم قرار است چه مسئله‌ای را حل کند؟</h2>
                  <p>این اطلاعات مبنای پیشنهاد متخصصان و نمایش فرصت‌های مناسب خواهد بود.</p>
                </div>
              </header>
              <div className="rh-team-form-grid">
                <label className="is-wide">
                  <span>نام تیم</span>
                  <input
                    value={draft.name}
                    onChange={(event) => update("name", event.target.value)}
                    placeholder="مثلاً تیم پایش هوشمند انرژی"
                  />
                </label>
                <label>
                  <span>حوزه اصلی فعالیت</span>
                  <select
                    value={draft.focus}
                    onChange={(event) => update("focus", event.target.value)}
                  >
                    <option value="">انتخاب حوزه فعالیت</option>
                    <option>مهندسی و ساخت</option>
                    <option>نرم‌افزار و داده</option>
                    <option>انرژی و محیط‌زیست</option>
                    <option>زیست‌فناوری و سلامت</option>
                    <option>طراحی محصول</option>
                  </select>
                </label>
                <label>
                  <span>نوع تیم</span>
                  <select
                    value={draft.type}
                    onChange={(event) => update("type", event.target.value)}
                  >
                    <option value="">انتخاب نوع تیم</option>
                    <option>تیم مستقل</option>
                    <option>تیم دانشگاهی</option>
                    <option>آزمایشگاه</option>
                    <option>هسته استارتاپی</option>
                    <option>شرکت رسمی</option>
                  </select>
                </label>
                <label className="is-wide">
                  <span>مرحله فعلی تیم</span>
                  <select
                    value={draft.maturity}
                    onChange={(event) => update("maturity", event.target.value)}
                  >
                    <option value="">انتخاب مرحله تیم</option>
                    <option>در حال شکل‌گیری</option>
                    <option>اعضای اصلی مشخص شده‌اند</option>
                    <option>دارای نمونه اولیه یا پروژه آزمایشی</option>
                    <option>دارای سابقه اجرای پروژه صنعتی</option>
                  </select>
                  <small>این شاخص به‌جای سابقه فردی، آمادگی فعلی تیم را مشخص می‌کند.</small>
                </label>
                <label className="is-wide">
                  <span>هدف و دامنه فعالیت تیم</span>
                  <textarea
                    rows={4}
                    value={draft.objective}
                    onChange={(event) => update("objective", event.target.value)}
                    placeholder="مسئله هدف، خروجی مورد انتظار و توانمندی فعلی تیم را توضیح دهید."
                  />
                  <small>
                    {draft.objective.trim().length.toLocaleString("fa-IR")} از حداقل ۲۰ کاراکتر
                  </small>
                </label>
                <label className="is-wide">
                  <span>چالش هدف (اختیاری)</span>
                  <select
                    value={draft.targetChallenge}
                    onChange={(event) => update("targetChallenge", event.target.value)}
                  >
                    <option value="">تیم برای چند فرصت ساخته می‌شود</option>
                    {challenges.slice(0, 4).map((challenge) => (
                      <option key={challenge.id} value={challenge.id}>
                        {challenge.title}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </>
          ) : step === 2 ? (
            <>
              <header>
                <span>
                  <Icon name="people" />
                </span>
                <div>
                  <h2>برای شروع چه عضوی کم دارید؟</h2>
                  <p>دعوت‌ها با همین دامنه نقش و شیوه همکاری ارسال می‌شوند.</p>
                </div>
              </header>
              <div className="rh-team-form-grid">
                <label>
                  <span>اولین نقش موردنیاز</span>
                  <select
                    value={draft.requiredRole}
                    onChange={(event) => update("requiredRole", event.target.value)}
                  >
                    <option value="">انتخاب نقش</option>
                    <option>متخصص فنی</option>
                    <option>تحلیلگر داده</option>
                    <option>طراح محصول</option>
                    <option>مدیر پروژه و پایلوت</option>
                    <option>پژوهشگر</option>
                  </select>
                </label>
                <label>
                  <span>ایمیل عمومی تیم (اختیاری)</span>
                  <input
                    dir="ltr"
                    value={draft.publicContact}
                    onChange={(event) => update("publicContact", event.target.value)}
                    placeholder="team@example.com"
                  />
                </label>
                <label>
                  <span>دعوت اولیه (اختیاری)</span>
                  <input
                    dir="ltr"
                    value={draft.initialInviteEmail}
                    onChange={(event) => update("initialInviteEmail", event.target.value)}
                    placeholder="member@example.com"
                  />
                </label>
                <label>
                  <span>شیوه همکاری</span>
                  <select
                    value={draft.collaboration}
                    onChange={(event) => update("collaboration", event.target.value)}
                  >
                    <option value="">انتخاب شیوه همکاری</option>
                    <option>پروژه‌ای و پاره‌وقت</option>
                    <option>تمام‌وقت</option>
                    <option>همکاری پژوهشی</option>
                    <option>مشاوره تخصصی</option>
                  </select>
                </label>
                <label className="is-wide">
                  <span>مهارت‌های کلیدی موردنیاز</span>
                  <input
                    value={draft.skills}
                    onChange={(event) => update("skills", event.target.value)}
                    placeholder="مثلاً بینایی ماشین، پایتون و تحلیل داده صنعتی"
                  />
                </label>
                <label>
                  <span>محل همکاری</span>
                  <input
                    value={draft.location}
                    onChange={(event) => update("location", event.target.value)}
                    placeholder="مثلاً تهران یا دورکار"
                  />
                </label>
                <div className="rh-team-plan-summary">
                  <strong>خلاصه درخواست جذب</strong>
                  <p>
                    {draft.name || "تیم جدید"} برای حوزه {draft.focus || "انتخاب‌نشده"} به نقش{" "}
                    {draft.requiredRole || "انتخاب‌نشده"} نیاز دارد.
                  </p>
                </div>
              </div>
            </>
          ) : (
            <>
              <header>
                <span>
                  <Icon name="shield" />
                </span>
                <div>
                  <h2>سیاست ارسال و پیش‌نمایش</h2>
                  <p>پیش از ساخت، اختیار نقش‌ها و مشخصات فضای تازه را مرور کنید.</p>
                </div>
              </header>
              <div className="rh-team-form-grid">
                <label className="rh-offer-response-consent is-wide">
                  <input
                    type="checkbox"
                    checked={draft.proposalManagersCanSubmit}
                    onChange={(event) => update("proposalManagersCanSubmit", event.target.checked)}
                  />
                  <span>مدیر پیشنهاد اجازه ارسال نهایی داشته باشد.</span>
                </label>
                <label className="rh-offer-response-consent is-wide">
                  <input
                    type="checkbox"
                    checked={draft.approvalBeforeSubmit}
                    onChange={(event) => update("approvalBeforeSubmit", event.target.checked)}
                  />
                  <span>پیش از ارسال نهایی تأیید داخلی لازم باشد.</span>
                </label>
                <section className="rh-team-plan-summary is-wide" aria-label="پیش‌نمایش تیم">
                  <strong>{draft.name}</strong>
                  <p>{draft.objective}</p>
                  <p>
                    {draft.type} · {draft.focus} · {draft.collaboration}
                  </p>
                  <p>
                    نقش موردنیاز: {draft.requiredRole} · {draft.skills}
                  </p>
                  {draft.initialInviteEmail && (
                    <p>
                      دعوت اولیه: <bdi dir="ltr">{draft.initialInviteEmail}</bdi>
                    </p>
                  )}
                </section>
              </div>
            </>
          )}
          {error && (
            <p className="rh-form-error" role="alert">
              {error}
            </p>
          )}
          <footer>
            {step > 1 && (
              <button
                type="button"
                className="is-secondary"
                onClick={() => {
                  setStep((current) => (current === 3 ? 2 : 1));
                  setError("");
                }}
              >
                مرحله قبل
              </button>
            )}
            <button
              type="button"
              className="is-primary"
              onClick={
                step === 1
                  ? continueSetup
                  : step === 2
                    ? () => {
                        if (
                          !draft.requiredRole ||
                          draft.skills.trim().length < 5 ||
                          !draft.collaboration ||
                          draft.location.trim().length < 2
                        ) {
                          createTeam();
                          return;
                        }
                        setError("");
                        setStep(3);
                      }
                    : createTeam
              }
            >
              {step === 1
                ? "ادامه و تعریف نیاز اعضا"
                : step === 2
                  ? "پیش‌نمایش و سیاست‌ها"
                  : "تأیید و ساخت فضای تیم"}
            </button>
          </footer>
        </section>
        <aside className="rh-card rh-team-setup-guide">
          <h2>بعد از ساخت تیم</h2>
          <ol>
            <li>
              <b>۱</b>
              <span>فضای مستقل تیم ساخته می‌شود.</span>
            </li>
            <li>
              <b>۲</b>
              <span>شما با نقش مالک تیم وارد می‌شوید.</span>
            </li>
            <li>
              <b>۳</b>
              <span>متخصصان متناسب با نقش‌های خالی پیشنهاد می‌شوند.</span>
            </li>
            <li>
              <b>۴</b>
              <span>ارسال راه‌حل فقط با فضای انتخاب‌شده انجام می‌شود.</span>
            </li>
          </ol>
          <Link href="/guides/intellectual-property">قواعد نقش‌ها و مالکیت تیم</Link>
        </aside>
      </div>
    </>
  );
}

export function TeamBuildingPage({ space }: { space: SolverSpace }) {
  return space === "individual" ? <IndividualTeamCreationPage /> : <TeamMemberDiscoveryPage />;
}
