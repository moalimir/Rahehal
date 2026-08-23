"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Brand } from "@/components/brand";
import { Icon } from "@/components/icons";
import { SiteHeader } from "@/components/site-header";
import { signInAsAuthorizedOrganization } from "@/lib/auth/demo-organization-session";
import { createDemoSession } from "@/lib/auth/session";
import { safeReturnTo } from "@/lib/auth/return-to";
import { buildSolverHref } from "@/lib/solver/context";
import { readLastActiveWorkspace, writeLastActiveWorkspace } from "@/lib/solver/session";
import { identifierError, otpError, passwordError } from "@/lib/validation/user-input";
import type { RouteDefinition } from "@/types";

type OrganizationAuthFields = {
  identifier: string;
  password: string;
  representativeName: string;
  representativeRole: string;
  email: string;
  phone: string;
  organizationName: string;
  organizationType: string;
  industry: string;
  nationalId: string;
  organizationPhone: string;
  about: string;
  address: string;
};

const emptyOrganizationAuthFields: OrganizationAuthFields = {
  identifier: "",
  password: "",
  representativeName: "",
  representativeRole: "",
  email: "",
  phone: "",
  organizationName: "",
  organizationType: "",
  industry: "",
  nationalId: "",
  organizationPhone: "",
  about: "",
  address: "",
};

function OrganizationAuthVisual({ kind }: { kind: "login" | "representative" | "company" }) {
  return (
    <aside
      className={`organization-auth-visual organization-auth-visual--${kind}`}
      role="img"
      aria-label="تیم متخصصان سازمانی در فضای صنعتی؛ چالش واقعی، راه‌حل اثرگذار"
    />
  );
}

function OrganizationRegistrationStepper({ step }: { step: 1 | 2 }) {
  const representative = (
    <div className={step === 1 ? "is-active" : "is-complete"}>
      <b>{step === 2 ? "✓" : "۱"}</b>
      <span>
        <strong>مرحله ۱</strong>
        <small>اطلاعات نماینده</small>
      </span>
    </div>
  );
  const company = (
    <div className={step === 2 ? "is-active" : ""}>
      <b>۲</b>
      <span>
        <strong>مرحله ۲</strong>
        <small>اطلاعات سازمان</small>
      </span>
    </div>
  );
  return (
    <div className="organization-registration-stepper" aria-label={`مرحله ${step} از ۲`}>
      {step === 1 ? representative : company}
      <i aria-hidden="true" />
      {step === 1 ? company : representative}
    </div>
  );
}

export function OrganizationAuthExperience({ definition }: { definition: RouteDefinition }) {
  const kind = definition.path.endsWith("/login")
    ? "login"
    : definition.path.endsWith("/representative")
      ? "representative"
      : "company";
  const [fields, setFields] = useState(emptyOrganizationAuthFields);
  const [showPassword, setShowPassword] = useState(false);
  const [consent, setConsent] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [returnTo, setReturnTo] = useState("");

  useEffect(() => {
    const params = readSolverAuthParams();
    setReturnTo(safeReturnTo(params.get("returnTo"), "org"));
    window.sessionStorage?.removeItem("rahhal.organization-registration.representative");
  }, []);

  const withReturnTo = (path: string) =>
    returnTo
      ? `${path}${path.includes("?") ? "&" : "?"}returnTo=${encodeURIComponent(returnTo)}`
      : path;

  const update = (field: keyof OrganizationAuthFields, value: string) => {
    setFields((current) => ({ ...current, [field]: value }));
    setError("");
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
    if (kind === "login") {
      if (fields.identifier.trim().length < 4 || fields.password.length < 8) {
        setError("ایمیل یا شماره همراه معتبر و رمز عبور حداقل ۸ کاراکتری وارد کنید.");
        return;
      }
      signInAsAuthorizedOrganization();
      setSuccess("ورود سازمانی با موفقیت انجام شد و پنل آماده نمایش است.");
      window.setTimeout(() => navigate(returnTo || "/app/org/dashboard"), 650);
      return;
    }
    if (kind === "representative") {
      const required = [
        fields.representativeName,
        fields.representativeRole,
        fields.email,
        fields.phone,
      ];
      if (required.some((value) => value.trim().length < 3) || fields.password.length < 8) {
        setError("همه اطلاعات نماینده و یک رمز عبور حداقل ۸ کاراکتری را کامل کنید.");
        return;
      }
      navigate(withReturnTo("/auth/organization/register/company"));
      return;
    }
    if (
      fields.organizationName.trim().length < 3 ||
      !fields.organizationType ||
      !fields.industry ||
      !consent
    ) {
      setError("نام، نوع و حوزه فعالیت سازمان را کامل و صحت اطلاعات را تأیید کنید.");
      return;
    }
    setSuccess("حساب سازمانی ایجاد شد؛ در حال انتقال به تأیید شماره همراه هستید.");
    window.setTimeout(() => navigate(withReturnTo("/auth/otp?role=organization")), 650);
  };

  return (
    <div className={`organization-auth-page organization-auth-page--${kind}`}>
      <header className="organization-auth-header">
        <Brand reference />
        <Link href="/">
          <span aria-hidden="true">←</span> بازگشت به صفحه اصلی
        </Link>
      </header>
      <main className="organization-auth-main" id="main-content">
        <section className="organization-auth-form-panel">
          <form
            className={`organization-auth-card organization-auth-card--${kind}`}
            onSubmit={submit}
            noValidate
          >
            <span className="organization-auth-badge">
              {kind === "login" ? "پنل سازمانی" : "حساب سازمانی"}
            </span>
            <h1>{definition.title}</h1>
            <p>{definition.summary}</p>

            {kind !== "login" && (
              <OrganizationRegistrationStepper step={kind === "representative" ? 1 : 2} />
            )}

            {kind === "login" && (
              <>
                <label className="organization-auth-field">
                  <span>ایمیل سازمانی یا شماره همراه</span>
                  <input
                    dir="ltr"
                    value={fields.identifier}
                    onChange={(event) => update("identifier", event.target.value)}
                    autoComplete="username"
                    aria-invalid={Boolean(error)}
                  />
                </label>
                <label className="organization-auth-field">
                  <span>رمز عبور</span>
                  <span className="organization-auth-password">
                    <input
                      dir="ltr"
                      aria-label="رمز عبور"
                      type={showPassword ? "text" : "password"}
                      value={fields.password}
                      onChange={(event) => update("password", event.target.value)}
                      autoComplete="current-password"
                      aria-invalid={Boolean(error)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((current) => !current)}
                      aria-label={showPassword ? "پنهان‌کردن رمز عبور" : "نمایش رمز عبور"}
                    >
                      <Icon name="eye" />
                    </button>
                  </span>
                </label>
                <div className="organization-auth-login-meta">
                  <label>
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={(event) => setRemember(event.target.checked)}
                    />
                    مرا به خاطر بسپار
                  </label>
                  <Link href="/auth/recovery?account=organization">
                    رمز عبور را فراموش کرده‌اید؟
                  </Link>
                </div>
              </>
            )}

            {kind === "representative" && (
              <div className="organization-auth-fields">
                <label className="organization-auth-field organization-auth-field--wide">
                  <span>نام و نام خانوادگی</span>
                  <input
                    value={fields.representativeName}
                    onChange={(event) => update("representativeName", event.target.value)}
                    autoComplete="name"
                  />
                </label>
                <label className="organization-auth-field organization-auth-field--wide">
                  <span>سمت سازمانی</span>
                  <input
                    value={fields.representativeRole}
                    onChange={(event) => update("representativeRole", event.target.value)}
                    placeholder="مثلاً مدیر تحقیق و توسعه"
                  />
                </label>
                <label className="organization-auth-field organization-auth-field--wide">
                  <span>ایمیل سازمانی</span>
                  <input
                    dir="ltr"
                    type="email"
                    value={fields.email}
                    onChange={(event) => update("email", event.target.value)}
                    placeholder="name@company.ir"
                    autoComplete="email"
                  />
                </label>
                <label className="organization-auth-field organization-auth-field--wide">
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
                <label className="organization-auth-field organization-auth-field--wide">
                  <span>رمز عبور</span>
                  <span className="organization-auth-password">
                    <input
                      dir="ltr"
                      type={showPassword ? "text" : "password"}
                      value={fields.password}
                      onChange={(event) => update("password", event.target.value)}
                      autoComplete="new-password"
                    />
                    <button type="button" onClick={() => setShowPassword((value) => !value)}>
                      <Icon name="eye" />
                      <span className="sr-only">نمایش یا پنهان‌کردن رمز عبور</span>
                    </button>
                  </span>
                  <small>حداقل ۸ کاراکتر؛ شامل عدد و حرف</small>
                </label>
              </div>
            )}

            {kind === "company" && (
              <div className="organization-auth-fields organization-auth-fields--company">
                <label className="organization-logo-upload">
                  <span>لوگوی سازمان</span>
                  <input type="file" accept="image/png,image/svg+xml" />
                  <b>
                    <Icon name="download" /> بارگذاری لوگو
                  </b>
                  <small>PNG یا SVG</small>
                </label>
                <label className="organization-auth-field organization-auth-field--wide">
                  <span>نام رسمی سازمان یا شرکت</span>
                  <input
                    value={fields.organizationName}
                    onChange={(event) => update("organizationName", event.target.value)}
                  />
                </label>
                <label className="organization-auth-field">
                  <span>نوع مجموعه</span>
                  <select
                    value={fields.organizationType}
                    onChange={(event) => update("organizationType", event.target.value)}
                  >
                    <option value="">انتخاب نوع مجموعه</option>
                    <option value="private">شرکت خصوصی</option>
                    <option value="public">سازمان دولتی</option>
                    <option value="holding">هلدینگ</option>
                    <option value="research">مرکز پژوهشی</option>
                  </select>
                </label>
                <label className="organization-auth-field">
                  <span>حوزه فعالیت</span>
                  <select
                    value={fields.industry}
                    onChange={(event) => update("industry", event.target.value)}
                  >
                    <option value="">انتخاب حوزه فعالیت</option>
                    <option value="industry">صنعت و تولید</option>
                    <option value="energy">انرژی و آب</option>
                    <option value="technology">فناوری</option>
                    <option value="health">سلامت</option>
                  </select>
                </label>
                <label className="organization-auth-field organization-auth-field--matched-row">
                  <span>شناسه ملی سازمان</span>
                  <input
                    dir="ltr"
                    value={fields.nationalId}
                    onChange={(event) => update("nationalId", event.target.value)}
                  />
                  <small>این اطلاعات فقط برای تأیید هویت سازمان استفاده می‌شود.</small>
                </label>
                <label className="organization-auth-field organization-auth-field--matched-row">
                  <span>شماره تلفن سازمان (اختیاری)</span>
                  <input
                    dir="ltr"
                    value={fields.organizationPhone}
                    onChange={(event) => update("organizationPhone", event.target.value)}
                  />
                  <small>برای تماس سازمانی؛ در صورت تمایل وارد کنید.</small>
                </label>
                <label className="organization-auth-field organization-auth-field--wide">
                  <span>شرح مختصری درباره سازمان</span>
                  <textarea
                    rows={2}
                    value={fields.about}
                    onChange={(event) => update("about", event.target.value)}
                  />
                </label>
                <label className="organization-auth-field organization-auth-field--wide">
                  <span>نشانی سازمان</span>
                  <textarea
                    rows={2}
                    value={fields.address}
                    onChange={(event) => update("address", event.target.value)}
                  />
                </label>
                <label className="organization-auth-consent organization-auth-field--wide">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(event) => setConsent(event.target.checked)}
                  />
                  <span>
                    صحت اطلاعات واردشده را تأیید می‌کنم و{" "}
                    <Link href="/legal/terms">قوانین استفاده از راه‌حل</Link> را می‌پذیرم.
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

            {kind === "login" && (
              <>
                <div className="organization-auth-divider">
                  <span>یا</span>
                </div>
                <button
                  className="organization-auth-secondary"
                  type="button"
                  onClick={() => setSuccess("کد یک‌بارمصرف برای شناسه واردشده ارسال می‌شود.")}
                >
                  ورود با کد یک‌بارمصرف
                </button>
                <p className="organization-auth-switch">
                  هنوز حساب سازمانی ندارید؟{" "}
                  <Link href="/auth/organization/register/representative">ثبت‌نام سازمان</Link>
                </p>
              </>
            )}
            {kind === "representative" && (
              <p className="organization-auth-switch">
                قبلاً حساب ساخته‌اید؟ <Link href="/auth/organization/login">ورود به حساب</Link>
              </p>
            )}
            {kind === "company" && (
              <>
                <button
                  className="organization-auth-back"
                  type="button"
                  onClick={() => navigate("/auth/organization/register/representative")}
                >
                  بازگشت به مرحله قبل
                </button>
                <small className="organization-auth-code-note">
                  پس از ثبت‌نام، کد تأیید برای شما ارسال می‌شود.
                </small>
              </>
            )}
          </form>
        </section>
        <OrganizationAuthVisual kind={kind} />
      </main>
    </div>
  );
}

export function SolverLoginExperience() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [errors, setErrors] = useState<{ identifier?: string; password?: string }>({});
  const [success, setSuccess] = useState("");
  const [returnTo, setReturnTo] = useState("");
  const [requestedRole, setRequestedRole] = useState<"solver" | "reviewer" | "ops">("solver");

  useEffect(() => {
    const isStandalone = document.documentElement.dataset.challengeStandalone === "true";
    const params = new URLSearchParams(
      isStandalone ? (window.location.hash.split("?")[1] ?? "") : window.location.search,
    );
    const requested = params.get("returnTo") ?? "";
    const role = params.get("role");
    const nextRole = role === "reviewer" || role === "ops" ? role : "solver";
    setRequestedRole(nextRole);
    setReturnTo(safeReturnTo(requested, nextRole));
  }, []);

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
    setErrors({});
    setSuccess("");
    const nextErrors = {
      identifier: identifierError(identifier),
      password: passwordError(password),
    };
    if (nextErrors.identifier || nextErrors.password) {
      setErrors(nextErrors);
      return;
    }
    setSuccess(
      requestedRole === "reviewer"
        ? "ورود داور با موفقیت انجام شد؛ در حال انتقال به مأموریت‌ها هستید."
        : requestedRole === "ops"
          ? "ورود عملیات با موفقیت انجام شد؛ در حال انتقال به صف کار هستید."
          : "ورود هویت حل‌کننده با موفقیت انجام شد؛ فضای کاری معتبر بازیابی می‌شود.",
    );
    const activeWorkspace = readLastActiveWorkspace();
    createDemoSession(
      requestedRole,
      requestedRole === "solver" ? activeWorkspace.workspaceId : `${requestedRole}-workspace`,
    );
    if (requestedRole === "solver") writeLastActiveWorkspace(activeWorkspace);
    const roleHome =
      requestedRole === "reviewer"
        ? "/app/reviewer/assignments"
        : requestedRole === "ops"
          ? "/app/ops/queue"
          : buildSolverHref("/app/solver/dashboard", activeWorkspace);
    window.setTimeout(() => navigate(returnTo || roleHome), 650);
  };

  return (
    <div className="solver-login-page">
      <header className="organization-auth-header solver-login-header">
        <Brand reference />
        <Link href="/">
          <span aria-hidden="true">←</span> بازگشت به صفحه اصلی
        </Link>
      </header>
      <main className="solver-login-main" id="main-content">
        <section className="solver-login-form-panel">
          <form className="solver-login-card" onSubmit={submit} noValidate>
            <span className="organization-auth-badge">یک حساب، چند فضای کاری</span>
            <h1>ورود حل‌کننده</h1>
            <p>
              با هویت انسانی خود وارد شوید؛ فضای شخصی و تیم‌های فعال پس از ورود قابل انتخاب‌اند.
            </p>

            <label className="organization-auth-field">
              <span>ایمیل یا شماره همراه</span>
              <input
                dir="ltr"
                value={identifier}
                onChange={(event) => {
                  setIdentifier(event.target.value);
                  setErrors((current) => ({ ...current, identifier: undefined }));
                }}
                placeholder="name@example.com"
                autoComplete="username"
                aria-invalid={Boolean(errors.identifier)}
                aria-describedby={errors.identifier ? "solver-login-identifier-error" : undefined}
              />
              {errors.identifier && (
                <small
                  id="solver-login-identifier-error"
                  className="organization-auth-field-error"
                  role="alert"
                >
                  {errors.identifier}
                </small>
              )}
            </label>
            <label className="organization-auth-field">
              <span>رمز عبور</span>
              <span className="organization-auth-password">
                <input
                  dir="ltr"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setErrors((current) => ({ ...current, password: undefined }));
                  }}
                  autoComplete="current-password"
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby={errors.password ? "solver-login-password-error" : undefined}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? "پنهان‌کردن رمز عبور" : "نمایش رمز عبور"}
                >
                  <Icon name="eye" />
                </button>
              </span>
              {errors.password && (
                <small
                  id="solver-login-password-error"
                  className="organization-auth-field-error"
                  role="alert"
                >
                  {errors.password}
                </small>
              )}
            </label>

            <div className="organization-auth-login-meta solver-login-meta">
              <label>
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(event) => setRemember(event.target.checked)}
                />
                مرا به خاطر بسپار
              </label>
              <Link href="/auth/recovery?account=solver">رمز عبور را فراموش کرده‌اید؟</Link>
            </div>

            {success && (
              <p className="organization-auth-message is-success" role="status">
                {success}
              </p>
            )}

            <button className="organization-auth-submit" type="submit">
              ورود به حساب
            </button>
            <div className="organization-auth-divider">
              <span>یا</span>
            </div>
            <button
              className="organization-auth-secondary"
              type="button"
              onClick={() => navigate("/auth/otp?role=solver")}
            >
              ورود با کد یک‌بارمصرف
            </button>
            <p className="organization-auth-switch">
              هنوز حساب ندارید؟ <Link href="/auth/solver/register/type">ایجاد حساب</Link>
            </p>
            <small className="solver-login-team-note">
              تیم رمز عبور مستقل ندارد؛ نقش شما از عضویت همان تیم خوانده می‌شود.
            </small>
          </form>
        </section>
        <aside
          className="solver-login-visual"
          role="img"
          aria-label="تیم متخصصان در آزمایشگاه صنعتی در حال توسعه یک راه‌حل"
        >
          <div>
            <h2>تخصص شما، راه‌حل یک مسئله واقعی</h2>
            <p>
              به چالش‌های واقعی سازمان‌ها متصل شوید و ایده‌های خود را به راه‌حل‌های اثرگذار تبدیل
              کنید.
            </p>
          </div>
        </aside>
      </main>
    </div>
  );
}

function navigateSolverAuth(path: string) {
  if (document.documentElement.dataset.challengeStandalone === "true") {
    window.location.hash = path;
    return;
  }
  window.location.assign(path);
}

export function readSolverAuthParams() {
  const standalone = document.documentElement.dataset.challengeStandalone === "true";
  return new URLSearchParams(
    standalone ? (window.location.hash.split("?")[1] ?? "") : window.location.search,
  );
}

function SolverAuthVisual() {
  return (
    <aside
      className="solver-login-visual solver-code-visual"
      role="img"
      aria-label="گروهی از متخصصان در محیط صنعتی در حال بررسی یک راه‌حل"
    >
      <div>
        <h2>تخصص شما، راه‌حل یک مسئله واقعی</h2>
        <p>
          به چالش‌های واقعی سازمان‌ها متصل شوید و ایده‌های خود را به راه‌حل‌های اثرگذار تبدیل کنید.
        </p>
      </div>
    </aside>
  );
}

function SolverCodeStepper({ current, labels }: { current: number; labels: string[] }) {
  return (
    <ol className={`solver-code-stepper solver-code-stepper--${labels.length}`}>
      {labels.map((label, index) => {
        const step = index + 1;
        return (
          <li
            className={step === current ? "is-active" : step < current ? "is-complete" : ""}
            aria-current={step === current ? "step" : undefined}
            key={label}
          >
            <b>{step < current ? <Icon name="check" /> : step.toLocaleString("fa-IR")}</b>
            <span>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function SolverRecoveryExperience() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [identifier, setIdentifier] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (step === 1) {
      const nextError = identifierError(identifier);
      if (nextError) {
        setError(nextError);
        return;
      }
      setStep(2);
      return;
    }
    if (step === 2) {
      const nextError = otpError(otp);
      if (nextError) {
        setError(nextError);
        return;
      }
      if (!["12345", "۱۲۳۴۵"].includes(otp.replace(/\s/g, ""))) {
        setError("کد تأیید صحیح نیست؛ در نسخه نمایشی از ۱۲۳۴۵ استفاده کنید.");
        return;
      }
      setStep(3);
      return;
    }
    const nextPasswordError = passwordError(password);
    if (nextPasswordError) {
      setError(nextPasswordError);
      return;
    }
    if (password !== confirmation) {
      setError("تکرار رمز عبور با رمز جدید یکسان نیست.");
      return;
    }
    setSuccess("رمز عبور با موفقیت تغییر کرد؛ اکنون می‌توانید وارد حساب شوید.");
  };

  const title =
    step === 1 ? "بازنشانی رمز عبور" : step === 2 ? "تأیید کد بازیابی" : "انتخاب رمز جدید";
  const description =
    step === 1
      ? "ایمیل یا شماره همراه مرتبط با حساب خود را وارد کنید تا کد تأیید برای شما ارسال شود."
      : step === 2
        ? `کد پنج‌رقمی ارسال‌شده به ${identifier} را وارد کنید.`
        : "یک رمز امن و تازه برای حساب خود انتخاب کنید.";

  return (
    <div className="solver-code-page">
      <main className="solver-code-main" id="main-content">
        <section className="solver-code-panel">
          <form className="solver-code-card" onSubmit={submit} noValidate>
            <span className="solver-code-badge">بازیابی حساب انسانی حل‌کننده</span>
            <p className="solver-login-team-note">
              بازیابی رمز برای هویت کاربر انجام می‌شود؛ تیم رمز مستقل ندارد.
            </p>
            <h1>{title}</h1>
            <p>{description}</p>
            <SolverCodeStepper current={step} labels={["تأیید هویت", "کد تأیید", "رمز جدید"]} />

            {step === 1 && (
              <label className="solver-code-field">
                <span>ایمیل یا شماره همراه</span>
                <span className="solver-code-input">
                  <Icon name="mail" />
                  <input
                    dir="ltr"
                    aria-label="ایمیل یا شماره همراه"
                    value={identifier}
                    onChange={(event) => {
                      setIdentifier(event.target.value);
                      setError("");
                    }}
                    placeholder="name@example.com یا ۰۹۱۲۱۲۳۴۵۶۷"
                    autoComplete="username"
                    aria-invalid={Boolean(error)}
                  />
                </span>
                <small>کد تأیید به همین ایمیل یا شماره همراه ارسال می‌شود.</small>
              </label>
            )}
            {step === 2 && (
              <label className="solver-code-field">
                <span>کد تأیید پنج‌رقمی</span>
                <span className="solver-code-input solver-code-input--otp">
                  <Icon name="key" />
                  <input
                    dir="ltr"
                    aria-label="کد تأیید پنج‌رقمی"
                    inputMode="numeric"
                    maxLength={5}
                    value={otp}
                    onChange={(event) => {
                      setOtp(event.target.value.replace(/[^0-9۰-۹]/g, ""));
                      setError("");
                    }}
                    placeholder="۱۲۳۴۵"
                    autoComplete="one-time-code"
                    aria-invalid={Boolean(error)}
                  />
                </span>
                <small>کد ۱۰ دقیقه اعتبار دارد و فقط یک‌بار قابل استفاده است.</small>
              </label>
            )}
            {step === 3 && (
              <div className="solver-code-passwords">
                <label className="solver-code-field">
                  <span>رمز عبور جدید</span>
                  <span className="solver-code-input">
                    <Icon name="lock" />
                    <input
                      dir="ltr"
                      type="password"
                      value={password}
                      onChange={(event) => {
                        setPassword(event.target.value);
                        setError("");
                      }}
                      autoComplete="new-password"
                    />
                  </span>
                </label>
                <label className="solver-code-field">
                  <span>تکرار رمز عبور جدید</span>
                  <span className="solver-code-input">
                    <Icon name="lock" />
                    <input
                      dir="ltr"
                      type="password"
                      value={confirmation}
                      onChange={(event) => {
                        setConfirmation(event.target.value);
                        setError("");
                      }}
                      autoComplete="new-password"
                    />
                  </span>
                </label>
              </div>
            )}

            {error && (
              <p className="solver-code-message is-error" role="alert">
                {error}
              </p>
            )}
            {success && (
              <p className="solver-code-message is-success" role="status">
                <Icon name="check" /> {success}
              </p>
            )}

            {!success && (
              <button className="solver-code-submit" type="submit">
                {step === 1 ? "ارسال کد تأیید" : step === 2 ? "تأیید کد" : "ثبت رمز جدید"}
                <Icon name="arrow" />
              </button>
            )}
            {step > 1 && !success && (
              <button
                className="solver-code-link"
                type="button"
                onClick={() => {
                  setStep(step === 3 ? 2 : 1);
                  setError("");
                }}
              >
                بازگشت به مرحله قبل
              </button>
            )}
            <Link className="solver-code-link" href="/auth/login?role=solver">
              <Icon name="arrow" /> بازگشت به صفحه ورود
            </Link>
            <aside className="solver-code-safe">
              <Icon name="shield" />
              <div>
                <strong>بازیابی امن حساب</strong>
                <p>کد تأیید ۱۰ دقیقه اعتبار دارد و فقط یک‌بار قابل استفاده است.</p>
              </div>
            </aside>
            <p className="solver-code-support">
              به ایمیل یا شماره همراه خود دسترسی ندارید؟{" "}
              <Link href="/contact">ارتباط با پشتیبانی</Link>
            </p>
          </form>
        </section>
        <SolverAuthVisual />
      </main>
    </div>
  );
}

function SolverOtpLoginExperience() {
  const [step, setStep] = useState<1 | 2>(1);
  const [identifier, setIdentifier] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [returnTo, setReturnTo] = useState("");

  useEffect(() => {
    const params = readSolverAuthParams();
    setReturnTo(safeReturnTo(params.get("returnTo"), "solver"));
  }, []);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (step === 1) {
      const nextError = identifierError(identifier);
      if (nextError) {
        setError(nextError);
        return;
      }
      setStep(2);
      return;
    }
    const nextError = otpError(otp);
    if (nextError) {
      setError(nextError);
      return;
    }
    if (!["12345", "۱۲۳۴۵"].includes(otp.replace(/\s/g, ""))) {
      setError("کد ورود صحیح نیست؛ در نسخه نمایشی از ۱۲۳۴۵ استفاده کنید.");
      return;
    }
    const activeWorkspace = readLastActiveWorkspace();
    createDemoSession("solver", activeWorkspace.workspaceId);
    writeLastActiveWorkspace(activeWorkspace);
    navigateSolverAuth(returnTo || buildSolverHref("/app/solver/dashboard", activeWorkspace));
  };

  return (
    <div className="solver-code-page solver-code-page--otp">
      <main className="solver-code-main" id="main-content">
        <section className="solver-code-panel">
          <form className="solver-code-card" onSubmit={submit} noValidate>
            <span className="solver-code-badge">یک هویت حل‌کننده</span>
            <h1>{step === 1 ? "ورود با کد یک‌بار مصرف" : "تأیید و ورود"}</h1>
            <p>
              {step === 1
                ? "ایمیل یا شماره همراه خود را وارد کنید تا کد ورود برای شما ارسال شود."
                : `کد پنج‌رقمی ارسال‌شده به ${identifier} را وارد کنید.`}
            </p>
            <p className="solver-login-team-note">
              پس از ورود، فضای شخصی و تیم‌های دارای عضویت فعال در انتخابگر workspace نمایش داده
              می‌شوند.
            </p>
            <SolverCodeStepper current={step} labels={["دریافت کد", "تأیید و ورود"]} />

            {step === 1 ? (
              <label className="solver-code-field">
                <span>ایمیل یا شماره همراه</span>
                <span className="solver-code-input">
                  <Icon name="mail" />
                  <input
                    dir="ltr"
                    aria-label="ایمیل یا شماره همراه"
                    value={identifier}
                    onChange={(event) => {
                      setIdentifier(event.target.value);
                      setError("");
                    }}
                    placeholder="name@example.com یا ۰۹۱۲۱۲۳۴۵۶۷"
                    autoComplete="username"
                    aria-invalid={Boolean(error)}
                  />
                </span>
                <small>کد یک‌بار مصرف به همین ایمیل یا شماره همراه ارسال می‌شود.</small>
              </label>
            ) : (
              <label className="solver-code-field">
                <span>کد ورود پنج‌رقمی</span>
                <span className="solver-code-input solver-code-input--otp">
                  <Icon name="key" />
                  <input
                    dir="ltr"
                    aria-label="کد ورود پنج‌رقمی"
                    inputMode="numeric"
                    maxLength={5}
                    value={otp}
                    onChange={(event) => {
                      setOtp(event.target.value.replace(/[^0-9۰-۹]/g, ""));
                      setError("");
                    }}
                    placeholder="۱۲۳۴۵"
                    autoComplete="one-time-code"
                    aria-invalid={Boolean(error)}
                  />
                </span>
                <small>کد کوتاه‌مدت است و فقط یک‌بار قابل استفاده خواهد بود.</small>
              </label>
            )}

            {error && (
              <p className="solver-code-message is-error" role="alert">
                {error}
              </p>
            )}
            <button className="solver-code-submit" type="submit">
              {step === 1 ? "ارسال کد ورود" : "تأیید و ورود"} <Icon name="arrow" />
            </button>
            {step === 2 && (
              <button className="solver-code-link" type="button" onClick={() => setStep(1)}>
                اصلاح ایمیل یا شماره همراه
              </button>
            )}
            <Link className="solver-code-link" href="/auth/login?role=solver">
              <Icon name="lock" /> ورود با رمز عبور
            </Link>
            <aside className="solver-code-safe">
              <Icon name="shield" />
              <div>
                <strong>ورود امن و سریع</strong>
                <p>کد ورود کوتاه‌مدت است و فقط یک‌بار قابل استفاده خواهد بود.</p>
              </div>
            </aside>
            <p className="solver-code-support">
              هنوز حساب کاربری ندارید؟ <Link href="/auth/solver/register/type">ایجاد حساب</Link>
            </p>
            <Link className="solver-code-support-link" href="/contact">
              ارتباط با پشتیبانی
            </Link>
          </form>
        </section>
        <SolverAuthVisual />
      </main>
    </div>
  );
}

export function AuthRouteExperience({
  definition,
  onNotice,
}: {
  definition: RouteDefinition;
  onNotice: (value: string) => void;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [role, setRole] = useState<"organization" | "solver">("organization");
  const [returnTo, setReturnTo] = useState("");
  const isRegister = definition.path === "/auth/register";
  const isOtp = definition.path === "/auth/otp";
  useEffect(() => {
    const params = readSolverAuthParams();
    setReturnTo(safeReturnTo(params.get("returnTo"), "any"));
    if (params.get("role") === "solver") setRole("solver");
  }, []);
  const submit = () => {
    if (!isRegister) {
      const nextError = isOtp ? otpError(value) : identifierError(value);
      if (nextError) {
        setError(nextError);
        return;
      }
    }
    if (isOtp && value.replace(/\s/g, "") !== "12345" && value.replace(/\s/g, "") !== "۱۲۳۴۵") {
      setError("رمز یک‌بارمصرف واردشده صحیح نیست؛ در نسخه نمایشی از ۱۲۳۴۵ استفاده کنید.");
      return;
    }
    setError("");
    if (isOtp && returnTo) {
      if (returnTo.startsWith("/app/org/")) signInAsAuthorizedOrganization();
      else createDemoSession("solver", "solver-individual");
      onNotice("ورود انجام شد؛ در حال بازگشت به مسیر درخواست‌شده هستید.");
      window.setTimeout(() => navigateSolverAuth(returnTo), 250);
      return;
    }
    onNotice("اطلاعات معتبر است؛ ورود نمونه با موفقیت انجام شد.");
  };
  return (
    <section className="auth-route-layout container">
      <div className="auth-card auth-card--route">
        <span className="eyebrow">{definition.code}</span>
        <h2>{definition.title}</h2>
        <p>{definition.summary}</p>
        {isRegister ? (
          <div className="auth-role-cards">
            {[
              ["organization", "سازمان مسئله‌گذار", "ثبت، انتشار و مدیریت پرونده"],
              ["solver", "حل‌کننده", "کشف، پیشنهاد و اجرای پایلوت"],
            ].map(([id, title, body]) => (
              <button
                key={id}
                className={role === id ? "active" : ""}
                onClick={() => setRole(id as typeof role)}
              >
                <Icon name={id === "organization" ? "brief" : "people"} />
                <strong>{title}</strong>
                <span>{body}</span>
              </button>
            ))}
          </div>
        ) : (
          <label>
            <span>
              {isOtp
                ? "رمز یک‌بارمصرف"
                : definition.path.includes("recovery")
                  ? "ایمیل یا شماره بازیابی"
                  : "موبایل یا ایمیل"}
            </span>
            <input
              dir="ltr"
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
                setError("");
              }}
              aria-invalid={Boolean(error)}
              placeholder={isOtp ? "12345" : "example@company.ir"}
            />
          </label>
        )}
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        {isOtp && (
          <div className="otp-meta">
            <span>اعتبار رمز: ۰۱:۴۲</span>
            <button className="text-button">ارسال مجدد پس از پایان شمارش</button>
          </div>
        )}
        {isRegister ? (
          <Link
            className="button button--primary"
            href={`/onboarding/${role}/contact${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`}
          >
            شروع مسیر {role === "organization" ? "سازمان" : "حل‌کننده"}
          </Link>
        ) : (
          <button className="button button--primary" onClick={submit}>
            {definition.primaryAction}
          </button>
        )}
        <div className="auth-safe-note">
          <Icon name="shield" /> خطاها وجود حساب را افشا نمی‌کنند و ورودی حفظ می‌شود.
        </div>
      </div>
      <aside className="auth-route-aside">
        <h3>پس از این مرحله</h3>
        <ol>
          {definition.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <Link href="/legal/privacy">حریم خصوصی و امنیت حساب</Link>
      </aside>
    </section>
  );
}

function useOrganizationAuthVariant() {
  const [organization, setOrganization] = useState<boolean | null>(null);
  useEffect(() => {
    const params = readSolverAuthParams();
    setOrganization(
      params.get("role") === "organization" || params.get("account") === "organization",
    );
  }, []);
  return organization;
}

export function AdaptiveRecoveryExperience({
  definition,
  onNotice,
}: {
  definition: RouteDefinition;
  onNotice: (value: string) => void;
}) {
  const organization = useOrganizationAuthVariant();
  if (organization === null) return <div className="solver-code-page" aria-busy="true" />;
  return organization ? (
    <div className="public-page">
      <SiteHeader />
      <main id="main-content">
        <AuthRouteExperience definition={definition} onNotice={onNotice} />
      </main>
    </div>
  ) : (
    <SolverRecoveryExperience />
  );
}

export function AdaptiveOtpExperience({
  definition,
  onNotice,
}: {
  definition: RouteDefinition;
  onNotice: (value: string) => void;
}) {
  const organization = useOrganizationAuthVariant();
  if (organization === null) return <div className="solver-code-page" aria-busy="true" />;
  return organization ? (
    <div className="public-page">
      <SiteHeader />
      <main id="main-content">
        <AuthRouteExperience definition={definition} onNotice={onNotice} />
      </main>
    </div>
  ) : (
    <SolverOtpLoginExperience />
  );
}
