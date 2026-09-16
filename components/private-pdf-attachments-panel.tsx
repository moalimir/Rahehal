"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { privatePdfMaxBytes, type FileTarget, type PrivateFileResource } from "@rahhal/contracts";
import { useWebRuntime } from "@/components/runtime-provider";
import { createPrivateFileGateway } from "@/lib/workspace/private-files";

export type PrivatePdfAttachmentsProps = FileTarget & {
  readonly expectedVersion?: number;
  readonly attachedIds?: readonly string[];
  readonly onAttach?: (file: PrivateFileResource) => void;
  readonly onRemove?: (id: string) => void;
  readonly disabled?: boolean;
};
const labels: Record<PrivateFileResource["state"], string> = {
  awaiting_upload: "در انتظار بارگذاری",
  quarantined: "قرنطینه؛ هنوز قابل استفاده نیست",
  pending_scan: "در انتظار اسکن",
  clean: "اسکن سالم",
  rejected: "رد شده؛ فایل نامعتبر یا مشکوک",
  scan_failed: "اسکن انجام نشد؛ دانلود مسدود است",
};

export function PrivatePdfAttachments(props: PrivatePdfAttachmentsProps) {
  const runtime = useWebRuntime();
  const workspace = runtime.me?.active_context?.workspace_id;
  if (runtime.mode !== "network" || !workspace) return null;
  return (
    <PdfAttachments
      key={`${workspace}:${props.entity_type}:${props.entity_id}`}
      {...props}
      workspace={workspace}
    />
  );
}
function PdfAttachments(props: PrivatePdfAttachmentsProps & { workspace: string }) {
  const gateway = useMemo(
    () =>
      createPrivateFileGateway(props.workspace, {
        entity_type: props.entity_type,
        entity_id: props.entity_id,
      }),
    [props.workspace, props.entity_type, props.entity_id],
  );
  const [files, setFiles] = useState<readonly PrivateFileResource[]>([]);
  const [selected, setSelected] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    void gateway.list().then((result) => {
      if (!active) return;
      if (result.ok) {
        setFiles(result.data);
        setError("");
      } else {
        setFiles([]);
        setError(result.error.message);
      }
    });
    return () => {
      active = false;
    };
  }, [gateway, refresh]);
  useEffect(() => {
    if (!files.some((file) => file.state === "pending_scan")) return;
    const timer = setTimeout(() => setRefresh((value) => value + 1), 2000);
    return () => clearTimeout(timer);
  }, [files]);
  const upload = useCallback(async () => {
    if (!selected) return;
    setPending(true);
    setError("");
    const result = await gateway.upload(selected, props.expectedVersion);
    setPending(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setSelected(null);
    setRefresh((value) => value + 1);
  }, [gateway, selected, props.expectedVersion]);
  return (
    <section aria-label="پیوست‌های PDF خصوصی" className="challenge-upload-field">
      <h3>{props.entity_type === "challenge" ? "PDFهای خصوصی چالش" : "PDFهای خصوصی پیشنهاد"}</h3>
      <p>
        حداکثر ۱۰ مگابایت؛ فایل تا پایان اسکن سالم قابل پیوست یا دانلود نیست. پیوست چالش فقط برای
        دعوت‌شده‌ها یا ارسال‌کنندگان پیشنهاد مجاز است.
      </p>
      {props.onAttach && (
        <div>
          <label>
            انتخاب PDF
            <input
              aria-label="انتخاب PDF خصوصی"
              type="file"
              accept=".pdf,application/pdf"
              disabled={pending || props.disabled}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                if (!/\.pdf$/i.test(file.name) || file.size < 1 || file.size > privatePdfMaxBytes) {
                  setError("فقط PDF با حجم حداکثر ۱۰ مگابایت مجاز است.");
                  event.target.value = "";
                  return;
                }
                setSelected(file);
                setError("");
              }}
            />
          </label>
          {selected && (
            <p>
              <bdi>{selected.name}</bdi>{" "}
              <button
                type="button"
                disabled={pending || props.disabled}
                onClick={() => void upload()}
              >
                {pending ? "در حال بارگذاری…" : "بارگذاری PDF"}
              </button>
            </p>
          )}
        </div>
      )}
      <button type="button" disabled={pending} onClick={() => setRefresh((value) => value + 1)}>
        بررسی وضعیت فایل‌ها
      </button>
      {error && <p role="alert">{error}</p>}
      <ul>
        {files
          .filter(
            (file) =>
              props.onAttach ||
              props.attachedIds === undefined ||
              props.attachedIds.includes(file.id),
          )
          .map((file) => (
            <li key={file.id}>
              <bdi>{file.filename}</bdi> — <span role="status">{labels[file.state]}</span>{" "}
              {file.state === "clean" && (
                <button
                  type="button"
                  onClick={async () => {
                    if (!(await gateway.download(file)))
                      setError("فایل در فضای کاری فعلی قابل دانلود نیست.");
                  }}
                >
                  دانلود PDF
                </button>
              )}
              {file.state === "clean" &&
                props.onAttach &&
                !props.attachedIds?.includes(file.id) && (
                  <button
                    type="button"
                    disabled={props.disabled || pending}
                    onClick={() => props.onAttach?.(file)}
                  >
                    افزودن به پیوست‌ها
                  </button>
                )}
              {props.attachedIds?.includes(file.id) && (
                <span>
                  {" "}
                  پیوست این نسخه{" "}
                  {props.onRemove && (
                    <button
                      type="button"
                      disabled={props.disabled || pending}
                      onClick={() => props.onRemove?.(file.id)}
                    >
                      حذف از پیش‌نویس
                    </button>
                  )}
                </span>
              )}
              {file.state === "scan_failed" && props.onAttach && (
                <button
                  type="button"
                  disabled={pending || props.disabled}
                  onClick={async () => {
                    setPending(true);
                    const result = await gateway.retryScan(file);
                    setPending(false);
                    if (!result.ok) setError(result.error.message);
                    else setRefresh((value) => value + 1);
                  }}
                >
                  تلاش دوباره برای اسکن
                </button>
              )}
            </li>
          ))}
      </ul>
      {props.onAttach && (
        <p>
          پس از «افزودن به پیوست‌ها»، پیش‌نویس را ذخیره کنید. حذف از پیش‌نویس، نسخه‌های قبلی را
          تغییر نمی‌دهد.
        </p>
      )}
    </section>
  );
}
