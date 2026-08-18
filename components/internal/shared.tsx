"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { sampleCase } from "@/data/fixtures/internal";
import type { ActionReceipt } from "@/lib/services/internal-service";

export function CaseHeader() {
  return (
    <section className="app-case-header" aria-label="خلاصه ثابت پرونده">
      <div className="app-case-header__identity">
        <div className="app-case-header__icon">
          <Icon name="brief" />
        </div>
        <div>
          <div className="app-inline-meta">
            <bdi>{sampleCase.id}</bdi>
            <span className="app-chip app-chip--info">{sampleCase.confidentiality}</span>
          </div>
          <h2>{sampleCase.title}</h2>
          <p>{sampleCase.organization} · آخرین تغییر ۱۸ دقیقه پیش</p>
        </div>
      </div>
      <div className="app-case-header__status">
        <div className="app-readiness" aria-label={`پیشرفت ${sampleCase.readiness} درصد`}>
          <span style={{ "--value": `${sampleCase.readiness}%` } as React.CSSProperties} />
          <strong>{sampleCase.readiness.toLocaleString("fa-IR")}٪</strong>
        </div>
        <div>
          <small>وضعیت جاری</small>
          <strong>{sampleCase.status}</strong>
          <span>{sampleCase.stage}</span>
        </div>
      </div>
      <dl className="app-case-header__facts">
        <div>
          <dt>مالک پرونده</dt>
          <dd>{sampleCase.owner}</dd>
        </div>
        <div>
          <dt>اقدام بعدی با</dt>
          <dd>{sampleCase.nextRole}</dd>
        </div>
        <div>
          <dt>مهلت / SLA</dt>
          <dd>
            {sampleCase.deadline}
            <small>{sampleCase.sla}</small>
          </dd>
        </div>
      </dl>
      <div className="app-case-header__blocker">
        <Icon name="notification" />
        <div>
          <small>مانع باز</small>
          <strong>{sampleCase.blocker}</strong>
        </div>
      </div>
    </section>
  );
}

export function MetricCard({
  label,
  value,
  detail,
  tone = "blue",
  icon = "trend",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "blue" | "green" | "amber" | "red" | "violet";
  icon?: "trend" | "history" | "decision" | "people" | "shield" | "impact" | "notification";
}) {
  return (
    <article className={`app-metric app-metric--${tone}`}>
      <span className="app-metric__icon">
        <Icon name={icon} />
      </span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        <span>{detail}</span>
      </div>
    </article>
  );
}

export function Panel({
  title,
  eyebrow,
  action,
  children,
  className = "",
}: {
  title: string;
  eyebrow?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`app-panel ${className}`}>
      <header className="app-panel__header">
        <div>
          {eyebrow && <span className="app-eyebrow">{eyebrow}</span>}
          <h2>{title}</h2>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

export function StatusBadge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "success" | "warning" | "danger" | "info" | "neutral" | "violet";
}) {
  return <span className={`app-status app-status--${tone}`}>{children}</span>;
}

export function ProgressBar({ value, label }: { value: number; label?: string }) {
  return (
    <div className="app-progress">
      {label && (
        <div>
          <span>{label}</span>
          <strong>{value.toLocaleString("fa-IR")}٪</strong>
        </div>
      )}
      <span className="app-progress__track">
        <i style={{ width: `${value}%` }} />
      </span>
    </div>
  );
}

export function GateChecklist({
  gates,
  onToggle,
}: {
  gates: Array<{ id: string; label: string; passed: boolean; evidence: string }>;
  onToggle?: (id: string) => void;
}) {
  return (
    <ul className="app-gates">
      {gates.map((gate) => (
        <li key={gate.id} className={gate.passed ? "is-passed" : "is-open"}>
          <button
            type="button"
            onClick={() => onToggle?.(gate.id)}
            disabled={!onToggle}
            aria-label={`${gate.label}: ${gate.passed ? "کامل" : "ناقص"}`}
          >
            <Icon name={gate.passed ? "check" : "history"} />
          </button>
          <div>
            <strong>{gate.label}</strong>
            <span>{gate.evidence}</span>
          </div>
          <StatusBadge tone={gate.passed ? "success" : "warning"}>
            {gate.passed ? "کامل" : "نیازمند اقدام"}
          </StatusBadge>
        </li>
      ))}
    </ul>
  );
}

export function ReceiptPanel({
  receipt,
  onClose,
}: {
  receipt: ActionReceipt;
  onClose: () => void;
}) {
  return (
    <section className="app-receipt" role="status" aria-label="رسید اقدام">
      <span className="app-receipt__mark">
        <Icon name="check" />
      </span>
      <div className="app-receipt__body">
        <span className="app-eyebrow">اقدام با موفقیت ثبت شد</span>
        <h2>{receipt.action}</h2>
        <dl>
          <div>
            <dt>شناسه رسید</dt>
            <dd>
              <bdi>{receipt.id}</bdi>
            </dd>
          </div>
          <div>
            <dt>نسخه</dt>
            <dd>
              <bdi>{receipt.version}</bdi>
            </dd>
          </div>
          <div>
            <dt>زمان ثبت</dt>
            <dd>{receipt.serverTime}</dd>
          </div>
          <div>
            <dt>رویداد حسابرسی</dt>
            <dd>
              <bdi dir="ltr">{receipt.auditEventId}</bdi>
            </dd>
          </div>
        </dl>
        <p>{receipt.nextAction}</p>
      </div>
      <button className="app-icon-button" onClick={onClose} aria-label="بستن رسید">
        <Icon name="close" />
      </button>
    </section>
  );
}

export function StateNotice({
  state,
  onReset,
}: {
  state:
    | "default"
    | "loading"
    | "offline"
    | "permission"
    | "conflict"
    | "error"
    | "empty"
    | "closed";
  onReset: () => void;
}) {
  if (state === "default") return null;
  if (state === "loading")
    return (
      <div className="app-state app-state--loading" aria-live="polite">
        <span />
        <span />
        <span />
      </div>
    );
  const messages = {
    offline: [
      "اتصال ناپایدار است",
      "پیش‌نویس روی این دستگاه حفظ شده و ۲ تغییر در صف همگام‌سازی است.",
      "بررسی اتصال",
    ],
    permission: [
      "دسترسی کافی ندارید",
      "وجود یا محتوای داده حساس افشا نمی‌شود. درخواست دسترسی برای مالک نقش ارسال کنید.",
      "بازگشت امن",
    ],
    conflict: [
      "نسخه جدیدتری ثبت شده است",
      "سارا نادری ۳ دقیقه پیش همین بخش را ویرایش کرده است. Diff را ببینید و Merge کنترل‌شده انجام دهید.",
      "مقایسه نسخه‌ها",
    ],
    error: [
      "ثبت اقدام کامل نشد",
      "Gate مالی ناقص است. ورودی‌ها حفظ شده‌اند. شناسه پیگیری: cor_blk_119",
      "تلاش دوباره",
    ],
    empty: [
      "هنوز رکوردی وجود ندارد",
      "نمونه را ببینید یا اولین رکورد را با اقدام اصلی صفحه بسازید.",
      "بازگرداندن داده نمونه",
    ],
    closed: [
      "پرونده بسته و فقط‌خواندنی است",
      "اقدام ناسازگار غیرفعال شده؛ بسته نهایی و تاریخچه همچنان قابل دریافت‌اند.",
      "مشاهده تاریخچه",
    ],
  } as const;
  const [title, body, action] = messages[state];
  return (
    <div className={`app-state app-state--${state}`} role={state === "error" ? "alert" : "status"}>
      <span>
        <Icon
          name={state === "permission" ? "lock" : state === "closed" ? "shield" : "notification"}
        />
      </span>
      <div>
        <h2>{title}</h2>
        <p>{body}</p>
      </div>
      <button className="app-button app-button--ghost" onClick={onReset}>
        {action}
      </button>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "انصراف",
  variant = "default",
  reasonRequired = false,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  variant?: "default" | "submission";
  reasonRequired?: boolean;
  onCancel: () => void;
  onConfirm: (reason?: string) => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const confirm = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (!open) return;
    setReason("");
    returnFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    confirm.current?.focus();
    const handle = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
      if (event.key !== "Tab" || !dialog.current) return;
      const focusable = dialog.current.querySelectorAll<HTMLElement>(
        "button,input,textarea,select,[tabindex]:not([tabindex='-1'])",
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handle);
    return () => {
      document.removeEventListener("keydown", handle);
      document.body.style.overflow = previousOverflow;
      returnFocus.current?.focus();
    };
  }, [open, onCancel]);
  if (!open) return null;
  return (
    <div className="app-dialog-layer" role="presentation">
      <div
        ref={dialog}
        className={`app-dialog app-dialog--${variant}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <div className="app-dialog__icon">
          <Icon name="shield" />
        </div>
        <h2 id={titleId}>{title}</h2>
        <p id={descriptionId}>{description}</p>
        {variant === "submission" && (
          <div className="app-dialog__submission-summary" aria-label="خلاصه ارسال نهایی">
            <div>
              <span>نسخه ارسالی</span>
              <strong>نسخه ۱</strong>
            </div>
            <div>
              <span>وضعیت پس از ارسال</span>
              <strong>قفل و ثبت رسید</strong>
            </div>
            <div>
              <span>مرحله بعد</span>
              <strong>بررسی اولیه سازمان</strong>
            </div>
          </div>
        )}
        {reasonRequired && (
          <label className="app-field">
            <span>
              دلیل تصمیم <b>*</b>
            </span>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="دلیل تصمیم را مشخص و قابل‌پیگیری بنویسید."
              rows={3}
              aria-invalid={reasonRequired && reason.trim().length > 0 && reason.trim().length < 10}
            />
            <small>حداقل ۱۰ کاراکتر؛ این متن در تاریخچه تصمیم ثبت می‌شود.</small>
          </label>
        )}
        <div className="app-dialog__effect">
          <strong>پیامد اقدام</strong>
          <span>نسخه، دلیل، شواهد و زمان در Audit ثبت می‌شوند و افراد مرتبط اعلان می‌گیرند.</span>
        </div>
        <div className="app-dialog__actions">
          <button className="app-button app-button--secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            ref={confirm}
            className={`app-button ${
              variant === "submission" ? "app-button--success" : "app-button--primary"
            }`}
            onClick={() => onConfirm(reasonRequired ? reason.trim() : undefined)}
            disabled={reasonRequired && reason.trim().length < 10}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function EmptyInline({
  title,
  body,
  action,
  onAction,
}: {
  title: string;
  body: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <div className="app-empty">
      <span>
        <Icon name="spark" />
      </span>
      <h3>{title}</h3>
      <p>{body}</p>
      <button className="app-button app-button--secondary" onClick={onAction}>
        {action}
      </button>
    </div>
  );
}
