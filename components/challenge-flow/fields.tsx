"use client";

import { useEffect, useId, useRef } from "react";
import type { ValidationIssue } from "@/lib/challenges/validation";

type CommonProps = {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  className?: string;
};

function FieldLabel({ label, required }: Pick<CommonProps, "label" | "required">) {
  return (
    <span className="challenge-field__label">
      {label} {required ? <b aria-label="الزامی">*</b> : <em>اختیاری</em>}
    </span>
  );
}

export function TextField({
  label,
  value,
  onChange,
  required,
  hint,
  error,
  type = "text",
  dir,
  placeholder,
  className = "",
}: CommonProps & {
  value: string;
  onChange: (value: string) => void;
  type?: string;
  dir?: "rtl" | "ltr";
  placeholder?: string;
}) {
  const id = useId();
  const helpId = `${id}-help`;
  return (
    <label className={`challenge-field ${className}`} htmlFor={id}>
      <FieldLabel label={label} required={required} />
      <input
        id={id}
        type={type}
        dir={dir}
        value={value}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        aria-describedby={hint || error ? helpId : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {(error || hint) && (
        <small id={helpId} className={error ? "is-error" : ""}>
          {error ?? hint}
        </small>
      )}
    </label>
  );
}

export function TextAreaField({
  label,
  value,
  onChange,
  required,
  hint,
  error,
  rows = 4,
  placeholder,
  className = "",
}: CommonProps & {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  const id = useId();
  const helpId = `${id}-help`;
  return (
    <label className={`challenge-field ${className}`} htmlFor={id}>
      <FieldLabel label={label} required={required} />
      <textarea
        id={id}
        rows={rows}
        value={value}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        aria-describedby={hint || error ? helpId : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {(error || hint) && (
        <small id={helpId} className={error ? "is-error" : ""}>
          {error ?? hint}
        </small>
      )}
    </label>
  );
}

export function SelectField({
  label,
  value,
  options,
  onChange,
  required,
  hint,
  error,
  className = "",
}: CommonProps & {
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const helpId = `${id}-help`;
  return (
    <label className={`challenge-field ${className}`} htmlFor={id}>
      <FieldLabel label={label} required={required} />
      <select
        id={id}
        value={value}
        aria-invalid={Boolean(error)}
        aria-describedby={hint || error ? helpId : undefined}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">انتخاب کنید</option>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
      {(error || hint) && (
        <small id={helpId} className={error ? "is-error" : ""}>
          {error ?? hint}
        </small>
      )}
    </label>
  );
}

export function RadioGroup<T extends string>({
  legend,
  value,
  options,
  onChange,
  required,
  error,
  compact = false,
}: {
  legend: string;
  value: T | "";
  options: Array<[T, string]>;
  onChange: (value: T) => void;
  required?: boolean;
  error?: string;
  compact?: boolean;
}) {
  const name = useId();
  return (
    <fieldset
      className={`challenge-choice-group ${compact ? "is-compact" : ""}`}
      aria-describedby={error ? `${name}-error` : undefined}
    >
      <legend>
        {legend} {required && <b aria-label="الزامی">*</b>}
      </legend>
      <div>
        {options.map(([optionValue, label]) => (
          <label key={optionValue} className={value === optionValue ? "is-selected" : ""}>
            <input
              type="radio"
              name={name}
              checked={value === optionValue}
              onChange={() => onChange(optionValue)}
            />
            <span>{label}</span>
          </label>
        ))}
      </div>
      {error && (
        <small id={`${name}-error`} className="is-error">
          {error}
        </small>
      )}
    </fieldset>
  );
}

export function CheckboxGroup<T extends string>({
  legend,
  values,
  options,
  onChange,
  required,
  error,
}: {
  legend: string;
  values: T[];
  options: Array<[T, string]>;
  onChange: (values: T[]) => void;
  required?: boolean;
  error?: string;
}) {
  const id = useId();
  return (
    <fieldset
      className="challenge-checkbox-group"
      aria-describedby={error ? `${id}-error` : undefined}
    >
      <legend>
        {legend} {required && <b aria-label="الزامی">*</b>}
      </legend>
      <div>
        {options.map(([optionValue, label]) => (
          <label key={optionValue}>
            <input
              type="checkbox"
              checked={values.includes(optionValue)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...values, optionValue]
                    : values.filter((item) => item !== optionValue),
                )
              }
            />
            <span>{label}</span>
          </label>
        ))}
      </div>
      {error && (
        <small id={`${id}-error`} className="is-error">
          {error}
        </small>
      )}
    </fieldset>
  );
}

export function SwitchField({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="challenge-switch">
      <span>
        <strong>{label}</strong>
        {description && <small>{description}</small>}
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <i aria-hidden="true" />
    </label>
  );
}

export function ErrorSummary({ issues }: { issues: ValidationIssue[] }) {
  if (!issues.length) return null;
  return (
    <div className="challenge-error-summary" role="alert">
      <strong>{issues.length.toLocaleString("fa-IR")} مورد را برای ادامه تکمیل کنید</strong>
      <ul>
        {issues.map((issue) => (
          <li key={issue.id}>{issue.message}</li>
        ))}
      </ul>
    </div>
  );
}

export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel,
  danger = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
      if (event.key !== "Tab" || !dialog.current) return;
      const controls = [...dialog.current.querySelectorAll<HTMLElement>("button")];
      if (!controls.length) return;
      const first = controls[0];
      const last = controls.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      previous?.focus();
    };
  }, [onCancel, open]);
  if (!open) return null;
  return (
    <div className="challenge-dialog-backdrop" role="presentation" onMouseDown={onCancel}>
      <div
        ref={dialog}
        className="challenge-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="challenge-dialog-title"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="challenge-dialog-title">{title}</h2>
        <div>{description}</div>
        <footer>
          <button
            type="button"
            className="challenge-button challenge-button--quiet"
            onClick={onCancel}
          >
            انصراف
          </button>
          <button
            type="button"
            className={`challenge-button ${danger ? "challenge-button--danger" : "challenge-button--primary"}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}

export function Toast({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="challenge-toast" role="status">
      {message}
    </div>
  );
}
