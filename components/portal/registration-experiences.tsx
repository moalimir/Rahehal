"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Brand } from "@/components/brand";
import { Icon } from "@/components/icons";
import { createDemoSession } from "@/lib/auth/session";
import { buildSolverHref } from "@/lib/solver/context";
import { readSolverState, registerSolverAccount } from "@/lib/solver/repository";
import { writeLastActiveWorkspace } from "@/lib/solver/session";
import { isEmail, isIranianMobile, passwordError, urlError } from "@/lib/validation/user-input";
import type { RouteDefinition } from "@/types";

type SolverAccountType = "individual" | "team";
type SolverTeamType =
  | ""
  | "formal-company"
  | "independent"
  | "independent-university"
  | "supervised-university";

type SolverRegistrationFields = {
  accountType: SolverAccountType;
  teamType: SolverTeamType;
  displayName: string;
  contactName: string;
  companyName: string;
  universityName: string;
  professorName: string;
  phone: string;
  email: string;
  password: string;
  confirmPassword: string;
  city: string;
  headline: string;
  expertise: string;
  experience: string;
  portfolio: string;
  bio: string;
};

const emptySolverRegistrationFields: SolverRegistrationFields = {
  accountType: "individual",
  teamType: "",
  displayName: "",
  contactName: "",
  companyName: "",
  universityName: "",
  professorName: "",
  phone: "",
  email: "",
  password: "",
  confirmPassword: "",
  city: "",
  headline: "",
  expertise: "",
  experience: "",
  portfolio: "",
  bio: "",
};

let solverRegistrationMemoryDraft: SolverRegistrationFields | null = null;

function SolverRegistrationStepper({ step }: { step: 1 | 2 | 3 }) {
  const item = (number: 1 | 2 | 3, title: string) => {
    const state = step === number ? "is-active" : step > number ? "is-complete" : "";
    return (
      <div className={state}>
        <b>{step > number ? "✓" : number.toLocaleString("fa-IR")}</b>
        <span>
          <strong>مرحله {number.toLocaleString("fa-IR")}</strong>
          <small>{title}</small>
        </span>
      </div>
    );
  };

  return (
    <div className="solver-registration-stepper" aria-label={`مرحله ${step} از ۳`}>
      {item(1, "شروع ثبت‌نام")}
      <i aria-hidden="true" />
      {item(2, "اطلاعات حساب")}
      <i aria-hidden="true" />
      {item(3, "پروفایل تخصصی")}
    </div>
  );
}

function SolverRegistrationVisual({
  step,
  accountType,
}: {
  step: 1 | 2 | 3;
  accountType: SolverAccountType;
}) {
  const copy = {
    1: {
      title: "تخصص شما، شروع یک راه‌حل واقعی",
      body: "یک هویت انسانی بسازید؛ پس از ورود می‌توانید تیم بسازید یا دعوت تیم‌ها را بپذیرید.",
    },
    2: {
      title: "یک حساب امن برای همکاری حرفه‌ای",
      body: "راه ارتباطی شما فقط برای مدیریت فرصت‌ها، دعوت‌ها و مراحل رسمی همکاری استفاده می‌شود.",
    },
    3:
      accountType === "team"
        ? {
            title: "آمادگی تیم را شفاف معرفی کنید",
            body: "ترکیب اعضا، مرحله بلوغ و خروجی‌های تیم، تطبیق دقیق‌تری با پروژه‌های سازمانی می‌سازد.",
          }
        : {
            title: "توانمندی خود را به فرصت تبدیل کنید",
            body: "پروفایل دقیق‌تر، تطبیق شفاف‌تر با چالش‌ها و پیشنهادهای مرتبط‌تری برای شما می‌سازد.",
          },
  }[step];

  return (
    <aside className={`solver-registration-visual solver-registration-visual--step-${step}`}>
      <div>
        <h2>{copy.title}</h2>
        <p>{copy.body}</p>
      </div>
      <span
        role="img"
        aria-label={
          step === 1
            ? "تیم متخصصان جوان در آزمایشگاه نوآوری"
            : step === 2
              ? "متخصص جوان در حال تکمیل اطلاعات با لپ‌تاپ"
              : "تیم فنی در حال مرور نمونه‌کار و نقشه‌های تخصصی"
        }
      />
    </aside>
  );
}

export function SolverRegistrationExperience({ definition }: { definition: RouteDefinition }) {
  const step: 1 | 2 | 3 = definition.path.endsWith("/type")
    ? 1
    : definition.path.endsWith("/account")
      ? 2
      : 3;
  const [fields, setFields] = useState(emptySolverRegistrationFields);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [resumeName, setResumeName] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (solverRegistrationMemoryDraft) {
      setFields(solverRegistrationMemoryDraft);
      return;
    }
    try {
      const saved = window.sessionStorage?.getItem("rahhal.solver-registration");
      if (!saved) return;
      const parsed = JSON.parse(saved) as {
        version?: number;
        savedAt?: number;
        fields?: Partial<SolverRegistrationFields>;
      };
      const unsafeFields =
        "version" in parsed && parsed.version === 2
          ? parsed.fields
          : (parsed as Partial<SolverRegistrationFields>);
      const safeFields: Partial<SolverRegistrationFields> = {
        accountType: unsafeFields?.accountType,
        teamType: unsafeFields?.teamType,
        city: unsafeFields?.city,
        headline: unsafeFields?.headline,
        expertise: unsafeFields?.expertise,
        experience: unsafeFields?.experience,
      };
      const restored = {
        ...emptySolverRegistrationFields,
        ...safeFields,
        accountType: "individual" as const,
        password: "",
        confirmPassword: "",
      };
      solverRegistrationMemoryDraft = restored;
      setFields(restored);
      window.sessionStorage?.setItem(
        "rahhal.solver-registration",
        JSON.stringify({ version: 2, savedAt: Date.now(), fields: safeFields }),
      );
    } catch {
      try {
        window.sessionStorage?.removeItem("rahhal.solver-registration");
      } catch {
        // Standalone file URLs can expose an opaque origin without session storage.
      }
    }
  }, []);

  const update = (field: keyof SolverRegistrationFields, value: string) => {
    setFields((current) => ({ ...current, [field]: value }));
    setError("");
  };

  const updateTeamType = (teamType: SolverTeamType) => {
    setFields((current) => ({
      ...current,
      teamType,
      companyName: teamType === "formal-company" ? current.companyName : "",
      universityName:
        teamType === "independent-university" || teamType === "supervised-university"
          ? current.universityName
          : "",
      professorName: teamType === "supervised-university" ? current.professorName : "",
    }));
    setError("");
  };

  const persist = (next = fields) => {
    solverRegistrationMemoryDraft = next;
    try {
      const safeDraft = {
        accountType: next.accountType,
        teamType: next.teamType,
        city: next.city,
        headline: next.headline,
        expertise: next.expertise,
        experience: next.experience,
      };
      window.sessionStorage?.setItem(
        "rahhal.solver-registration",
        JSON.stringify({ version: 2, savedAt: Date.now(), fields: safeDraft }),
      );
    } catch {
      // Navigation still works when a standalone browser blocks session storage.
    }
  };

  const navigate = (path: string) => {
    if (document.documentElement.dataset.challengeStandalone === "true") {
      window.location.hash = path;
      window.scrollTo({ top: 0, behavior: "auto" });
    } else {
      window.location.assign(path);
    }
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (step === 1) {
      const individualFields = {
        ...fields,
        accountType: "individual" as const,
        teamType: "" as const,
      };
      setFields(individualFields);
      persist(individualFields);
      navigate("/auth/solver/register/account");
      return;
    }
    if (step === 2) {
      if (fields.displayName.trim().length < 3) {
        setError(
          fields.accountType === "team"
            ? "نام تیم باید حداقل ۳ کاراکتر باشد."
            : "نام و نام خانوادگی را کامل وارد کنید.",
        );
        return;
      }
      if (fields.accountType === "team" && fields.contactName.trim().length < 3) {
        setError("نام و نام خانوادگی نماینده تیم را کامل وارد کنید.");
        return;
      }
      if (!isIranianMobile(fields.phone)) {
        setError("شماره همراه باید ۱۱ رقم و با ۰۹ شروع شود؛ نمونه: ۰۹۱۲۱۲۳۴۵۶۷");
        return;
      }
      if (!isEmail(fields.email)) {
        setError("ساختار ایمیل درست نیست؛ نمونه: name@example.com");
        return;
      }
      const nextPasswordError = passwordError(fields.password);
      if (nextPasswordError) {
        setError(nextPasswordError);
        return;
      }
      if (!fields.confirmPassword) {
        setError("تکرار رمز عبور را وارد کنید.");
        return;
      }
      if (fields.password !== fields.confirmPassword) {
        setError("تکرار رمز عبور با رمز عبور یکسان نیست.");
        return;
      }
      if (fields.accountType === "team") {
        if (!fields.teamType) {
          setError("نوع تیم را انتخاب کنید.");
          return;
        }
        if (fields.teamType === "formal-company" && fields.companyName.trim().length < 3) {
          setError("نام رسمی شرکت را وارد کنید.");
          return;
        }
        if (
          (fields.teamType === "independent-university" ||
            fields.teamType === "supervised-university") &&
          !fields.universityName
        ) {
          setError("دانشگاه مرتبط با تیم را انتخاب کنید.");
          return;
        }
        if (fields.teamType === "supervised-university" && fields.professorName.trim().length < 3) {
          setError("نام استاد ناظر را وارد کنید.");
          return;
        }
      }
      persist();
      navigate("/auth/solver/register/profile");
      return;
    }
    if (fields.headline.trim().length < 3) {
      setError(
        fields.accountType === "team"
          ? "عنوان و زمینه فعالیت تیم را وارد کنید."
          : "عنوان حرفه‌ای را وارد کنید.",
      );
      return;
    }
    if (!fields.expertise) {
      setError("حوزه تخصص اصلی را انتخاب کنید.");
      return;
    }
    if (!fields.experience) {
      setError(
        fields.accountType === "team"
          ? "مرحله بلوغ و آمادگی تیم را انتخاب کنید."
          : "سابقه فعالیت حرفه‌ای را انتخاب کنید.",
      );
      return;
    }
    if (fields.bio.trim().length < 20) {
      setError(
        fields.accountType === "team"
          ? "معرفی تیم و توانمندی جمعی باید حداقل ۲۰ کاراکتر باشد."
          : "معرفی کوتاه باید حداقل ۲۰ کاراکتر باشد.",
      );
      return;
    }
    const portfolioError = urlError(fields.portfolio);
    if (portfolioError) {
      setError(portfolioError);
      return;
    }
    if (!consent) {
      setError("برای ساخت حساب، تأیید صحت اطلاعات و پذیرش قوانین الزامی است.");
      return;
    }
    persist();
    const registration = registerSolverAccount({
      displayName: fields.displayName,
      email: fields.email,
      mobile: fields.phone,
      headline: fields.headline,
      bio: fields.bio,
      skills: [fields.expertise].filter(Boolean),
      availability: fields.experience,
      resumeFileName: resumeName || undefined,
    });
    if (!registration.ok) {
      setError(registration.message);
      return;
    }
    const personalContext = {
      type: "individual" as const,
      workspaceId: readSolverState().personalWorkspace.id,
    };
    try {
      writeLastActiveWorkspace(personalContext);
      createDemoSession("solver", personalContext.workspaceId);
      window.sessionStorage?.removeItem("rahhal.solver-registration");
    } catch {
      // The destination query keeps the workspace correct without browser storage.
    }
    solverRegistrationMemoryDraft = null;
    setSuccess(`حساب انسانی و فضای شخصی ساخته شد؛ رسید ${registration.receiptId}.`);
    window.setTimeout(
      () => navigate(buildSolverHref("/app/solver/dashboard", personalContext)),
      650,
    );
  };

  return (
    <div className={`solver-registration-page solver-registration-page--step-${step}`}>
      <header className="organization-auth-header solver-registration-header">
        <Brand reference />
        <Link href="/">
          <span aria-hidden="true">←</span> بازگشت به صفحه اصلی
        </Link>
      </header>
      <main className="solver-registration-main" id="main-content">
        <section className="solver-registration-form-panel">
          <form className="solver-registration-card" onSubmit={submit} noValidate>
            <span className="organization-auth-badge">حساب انسانی حل‌کننده</span>
            <h1>{definition.title}</h1>
            <p>
              {step === 3 && fields.accountType === "team"
                ? "حوزه فعالیت، مرحله بلوغ، ترکیب توانمندی و خروجی‌های تیم را ثبت کنید تا فرصت‌های مناسب‌تری پیشنهاد شوند."
                : definition.summary}
            </p>
            <SolverRegistrationStepper step={step} />

            {step === 1 && (
              <div className="solver-account-type-cards" aria-label="نوع حساب حل‌کننده">
                <article className="is-selected">
                  <span>
                    <Icon name="brief" />
                  </span>
                  <strong>حساب حل‌کننده</strong>
                  <small>
                    فضای شخصی به‌صورت خودکار ساخته می‌شود؛ تیم‌ها فضای کاری هستند و رمز عبور جدا
                    ندارند.
                  </small>
                  <b aria-hidden="true">✓</b>
                </article>
              </div>
            )}

            {step === 2 && (
              <div className="organization-auth-fields solver-registration-fields">
                <label className="organization-auth-field organization-auth-field--wide">
                  <span>{fields.accountType === "team" ? "نام تیم" : "نام و نام خانوادگی"}</span>
                  <input
                    value={fields.displayName}
                    onChange={(event) => update("displayName", event.target.value)}
                    autoComplete={fields.accountType === "team" ? "organization" : "name"}
                  />
                </label>
                {fields.accountType === "team" && (
                  <>
                    <label className="organization-auth-field organization-auth-field--wide">
                      <span>نام و نام خانوادگی نماینده تیم</span>
                      <input
                        value={fields.contactName}
                        onChange={(event) => update("contactName", event.target.value)}
                        autoComplete="name"
                      />
                    </label>
                    <label className="organization-auth-field organization-auth-field--wide solver-team-type-field">
                      <span>نوع تیم</span>
                      <select
                        value={fields.teamType}
                        onChange={(event) => updateTeamType(event.target.value as SolverTeamType)}
                      >
                        <option value="">انتخاب نوع تیم</option>
                        <option value="formal-company">شرکت رسمی</option>
                        <option value="independent">تیم مستقل</option>
                        <option value="independent-university">تیم دانشگاهی مستقل</option>
                        <option value="supervised-university">تیم دانشگاهی تحت نظر استاد</option>
                      </select>
                      <small>نوع تیم، مدارک و فرصت‌های قابل مشاهده را مشخص می‌کند.</small>
                    </label>
                    {fields.teamType === "formal-company" && (
                      <label className="organization-auth-field organization-auth-field--wide solver-team-conditional-field">
                        <span>نام رسمی شرکت</span>
                        <input
                          value={fields.companyName}
                          onChange={(event) => update("companyName", event.target.value)}
                          autoComplete="organization"
                          placeholder="نام ثبت‌شده شرکت"
                        />
                      </label>
                    )}
                    {fields.teamType === "independent-university" && (
                      <label className="organization-auth-field organization-auth-field--wide solver-team-conditional-field">
                        <span>نام دانشگاه</span>
                        <select
                          value={fields.universityName}
                          onChange={(event) => update("universityName", event.target.value)}
                        >
                          <option value="">انتخاب دانشگاه</option>
                          <option>دانشگاه صنعتی شریف</option>
                          <option>دانشگاه تهران</option>
                          <option>دانشگاه صنعتی امیرکبیر</option>
                          <option>دانشگاه علم و صنعت ایران</option>
                          <option>سایر دانشگاه‌ها</option>
                        </select>
                      </label>
                    )}
                    {fields.teamType === "supervised-university" && (
                      <>
                        <label className="organization-auth-field solver-team-conditional-field">
                          <span>نام دانشگاه</span>
                          <select
                            value={fields.universityName}
                            onChange={(event) => update("universityName", event.target.value)}
                          >
                            <option value="">انتخاب دانشگاه</option>
                            <option>دانشگاه صنعتی شریف</option>
                            <option>دانشگاه تهران</option>
                            <option>دانشگاه صنعتی امیرکبیر</option>
                            <option>دانشگاه علم و صنعت ایران</option>
                            <option>سایر دانشگاه‌ها</option>
                          </select>
                        </label>
                        <label className="organization-auth-field solver-team-conditional-field">
                          <span>نام و نام خانوادگی استاد ناظر</span>
                          <input
                            value={fields.professorName}
                            onChange={(event) => update("professorName", event.target.value)}
                            placeholder="مثلاً دکتر علی رضایی"
                          />
                        </label>
                      </>
                    )}
                  </>
                )}
                <label className="organization-auth-field">
                  <span>شماره همراه</span>
                  <input
                    dir="ltr"
                    inputMode="tel"
                    value={fields.phone}
                    onChange={(event) => update("phone", event.target.value)}
                    placeholder="۰۹۱۲۱۲۳۴۵۶۷"
                    autoComplete="tel"
                  />
                </label>
                <label className="organization-auth-field">
                  <span>ایمیل</span>
                  <input
                    dir="ltr"
                    type="email"
                    value={fields.email}
                    onChange={(event) => update("email", event.target.value)}
                    placeholder="name@example.com"
                    autoComplete="email"
                  />
                </label>
                <label className="organization-auth-field organization-auth-field--password-pair">
                  <span>رمز عبور</span>
                  <span className="organization-auth-password">
                    <input
                      dir="ltr"
                      aria-label="رمز عبور"
                      type={showPassword ? "text" : "password"}
                      value={fields.password}
                      onChange={(event) => update("password", event.target.value)}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((current) => !current)}
                      aria-label={showPassword ? "پنهان‌کردن رمز عبور" : "نمایش رمز عبور"}
                    >
                      <Icon name="eye" />
                    </button>
                  </span>
                  <small>حداقل ۸ کاراکتر؛ شامل عدد و حرف</small>
                </label>
                <label className="organization-auth-field organization-auth-field--password-pair">
                  <span>تکرار رمز عبور</span>
                  <span className="organization-auth-password">
                    <input
                      dir="ltr"
                      aria-label="تکرار رمز عبور"
                      type={showConfirmPassword ? "text" : "password"}
                      value={fields.confirmPassword}
                      onChange={(event) => update("confirmPassword", event.target.value)}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((current) => !current)}
                      aria-label={
                        showConfirmPassword ? "پنهان‌کردن تکرار رمز عبور" : "نمایش تکرار رمز عبور"
                      }
                    >
                      <Icon name="eye" />
                    </button>
                  </span>
                  <small>همان رمز عبور را دوباره وارد کنید.</small>
                </label>
              </div>
            )}

            {step === 3 && (
              <div
                className={`organization-auth-fields solver-registration-fields solver-registration-fields--profile ${
                  fields.accountType === "team" ? "solver-registration-fields--team-profile" : ""
                }`}
              >
                <label className="organization-auth-field organization-auth-field--wide">
                  <span>
                    {fields.accountType === "team" ? "عنوان و زمینه فعالیت تیم" : "عنوان حرفه‌ای"}
                  </span>
                  <input
                    value={fields.headline}
                    onChange={(event) => update("headline", event.target.value)}
                    placeholder={
                      fields.accountType === "team"
                        ? "مثلاً تیم طراحی و ساخت تجهیزات هوشمند"
                        : "مثلاً پژوهشگر هوش مصنوعی صنعتی"
                    }
                  />
                </label>
                <label className="organization-auth-field organization-auth-field--matched-row">
                  <span>حوزه تخصص اصلی</span>
                  <select
                    aria-label="حوزه تخصص اصلی"
                    value={fields.expertise}
                    onChange={(event) => update("expertise", event.target.value)}
                  >
                    <option value="">انتخاب حوزه تخصص</option>
                    <option value="engineering">مهندسی و ساخت</option>
                    <option value="software">نرم‌افزار و داده</option>
                    <option value="energy">انرژی و محیط‌زیست</option>
                    <option value="health">زیست‌فناوری و سلامت</option>
                    <option value="design">طراحی محصول و تجربه</option>
                    <option value="research">پژوهش و توسعه</option>
                  </select>
                  <small>
                    {fields.accountType === "team"
                      ? "حوزه‌ای را انتخاب کنید که بیشترین سهم را در خروجی جمعی تیم دارد."
                      : "تخصص محوری خود را برای تطبیق فرصت‌ها مشخص کنید."}
                  </small>
                </label>
                <label className="organization-auth-field organization-auth-field--matched-row">
                  <span>
                    {fields.accountType === "team" ? "مرحله بلوغ و آمادگی تیم" : "سابقه فعالیت"}
                  </span>
                  <select
                    aria-label={
                      fields.accountType === "team" ? "مرحله بلوغ و آمادگی تیم" : "سابقه فعالیت"
                    }
                    value={fields.experience}
                    onChange={(event) => update("experience", event.target.value)}
                  >
                    {fields.accountType === "team" ? (
                      <>
                        <option value="">انتخاب مرحله فعلی تیم</option>
                        <option value="forming">در حال شکل‌گیری و تکمیل اعضای اصلی</option>
                        <option value="formed">تیم شکل‌گرفته، بدون پروژه اجرایی</option>
                        <option value="prototype">دارای نمونه اولیه یا پروژه آزمایشی</option>
                        <option value="industrial">دارای سابقه اجرای پروژه صنعتی</option>
                        <option value="established">تیم یا شرکت تثبیت‌شده</option>
                      </>
                    ) : (
                      <>
                        <option value="">انتخاب سابقه حرفه‌ای</option>
                        <option value="student">دانشجو یا تازه‌کار</option>
                        <option value="1-3">۱ تا ۳ سال</option>
                        <option value="3-7">۳ تا ۷ سال</option>
                        <option value="7+">بیش از ۷ سال</option>
                      </>
                    )}
                  </select>
                  <small>
                    {fields.accountType === "team"
                      ? "مرحله تیم بر اساس آمادگی اعضا و خروجی اجرایی سنجیده می‌شود، نه سابقه یک فرد."
                      : "مجموع تجربه حرفه‌ای مرتبط خود را انتخاب کنید."}
                  </small>
                </label>
                <label className="organization-auth-field organization-auth-field--matched-row">
                  <span>شهر محل فعالیت</span>
                  <input
                    value={fields.city}
                    onChange={(event) => update("city", event.target.value)}
                    placeholder="مثلاً تهران"
                  />
                  <small>
                    {fields.accountType === "team"
                      ? "شهر اصلی فعالیت یا محل استقرار بیشتر اعضای تیم."
                      : "شهر اصلی فعالیت حرفه‌ای شما."}
                  </small>
                </label>
                <label className="organization-auth-field organization-auth-field--matched-row">
                  <span>
                    {fields.accountType === "team"
                      ? "لینک معرفی یا نمونه‌کار تیم (اختیاری)"
                      : "لینک نمونه‌کار یا پروفایل حرفه‌ای (اختیاری)"}
                  </span>
                  <input
                    dir="ltr"
                    type="url"
                    value={fields.portfolio}
                    onChange={(event) => update("portfolio", event.target.value)}
                    placeholder="https://"
                  />
                  <small>لینک عمومی و قابل مشاهده برای سازمان؛ واردکردن آن اختیاری است.</small>
                </label>
                <label className="organization-auth-field organization-auth-field--wide">
                  <span>
                    {fields.accountType === "team"
                      ? "معرفی تیم و توانمندی جمعی"
                      : "معرفی کوتاه و توانمندی‌ها"}
                  </span>
                  <textarea
                    rows={3}
                    value={fields.bio}
                    onChange={(event) => update("bio", event.target.value)}
                    placeholder={
                      fields.accountType === "team"
                        ? "درباره ترکیب اعضا، توانمندی جمعی، خروجی‌های فعلی و نوع مسئله‌های هدف بنویسید."
                        : "درباره تخصص، تجربه و نوع مسئله‌هایی که می‌توانید حل کنید بنویسید."
                    }
                  />
                  <small>حداقل ۲۰ کاراکتر؛ اطلاعات حساس یا محرمانه وارد نکنید.</small>
                </label>
                <label className="solver-resume-upload organization-auth-field--wide">
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) {
                        setResumeName("");
                        return;
                      }
                      if (file.size > 10 * 1024 * 1024) {
                        setError("حجم رزومه نباید بیشتر از ۱۰ مگابایت باشد.");
                        event.target.value = "";
                        return;
                      }
                      if (!/\.(pdf|docx?)$/i.test(file.name)) {
                        setError("فرمت رزومه باید PDF، DOC یا DOCX باشد.");
                        event.target.value = "";
                        return;
                      }
                      setError("");
                      setResumeName(file.name);
                    }}
                  />
                  <span>
                    <Icon name="download" />
                  </span>
                  <b>
                    {resumeName ||
                      (fields.accountType === "team"
                        ? "بارگذاری معرفی‌نامه تیم"
                        : "بارگذاری رزومه")}
                  </b>
                  <small>PDF یا DOCX، حداکثر ۱۰ مگابایت</small>
                </label>
                <label className="organization-auth-consent organization-auth-field--wide">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(event) => setConsent(event.target.checked)}
                  />
                  <span>
                    صحت اطلاعات را تأیید می‌کنم و{" "}
                    <Link href="/legal/terms">قوانین استفاده از راه‌حل</Link> و{" "}
                    <Link href="/legal/privacy">حریم خصوصی</Link> را می‌پذیرم.
                  </span>
                </label>
              </div>
            )}

            {error && (
              <p className="organization-auth-message is-error" role="alert">
                {error}
              </p>
            )}
            {success && (
              <p className="organization-auth-message is-success" role="status">
                {success}
              </p>
            )}

            <button className="organization-auth-submit" type="submit">
              {definition.primaryAction}
            </button>
            {step > 1 && (
              <button
                className="organization-auth-back"
                type="button"
                onClick={() =>
                  navigate(
                    step === 2 ? "/auth/solver/register/type" : "/auth/solver/register/account",
                  )
                }
              >
                بازگشت به مرحله قبل
              </button>
            )}
            {step === 1 && (
              <p className="organization-auth-switch">
                قبلاً حساب ساخته‌اید؟ <Link href="/auth/login?role=solver">ورود فرد یا تیم</Link>
              </p>
            )}
          </form>
        </section>
        <SolverRegistrationVisual step={step} accountType={fields.accountType} />
      </main>
    </div>
  );
}
