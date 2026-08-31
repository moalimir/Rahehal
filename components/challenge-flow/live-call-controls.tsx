"use client";

import { useState } from "react";
import type { ChallengeResource } from "@rahhal/contracts";
import type { ChallengePublicationState } from "@rahhal/domain";

import { ConfirmModal } from "@/components/challenge-flow/fields";
import type {
  ChallengeGovernanceGateway,
  ChallengePublicationCommand,
} from "@/lib/challenges/governance";
import { formatDateTime, tehranTimeLabel, tehranWallClockToIso } from "@/lib/challenges/model";

const stateLabels: Record<ChallengePublicationState, string> = {
  open: "باز و در حال پذیرش پیشنهاد",
  paused: "موقتاً متوقف",
  closed: "بسته‌شده",
  cancelled: "لغوشده",
};

export function LiveCallControls({
  challenge,
  canManage,
  gateway,
  onChange,
  onMessage,
}: {
  challenge: ChallengeResource;
  canManage: boolean;
  gateway: ChallengeGovernanceGateway;
  onChange: (challenge: ChallengeResource) => void;
  onMessage: (message: string) => void;
}) {
  const [publicationReason, setPublicationReason] = useState("");
  const [extensionReason, setExtensionReason] = useState("");
  const [proposalDeadline, setProposalDeadline] = useState("");
  const [terminalCommand, setTerminalCommand] = useState<"close" | "cancel" | null>(null);
  const [busy, setBusy] = useState(false);
  const publicationState = challenge.publication_state;

  if (challenge.stage !== "published" || !publicationState) return null;

  const run = async (
    operation: () => ReturnType<ChallengeGovernanceGateway["changePublicationState"]>,
    successMessage: string,
  ) => {
    if (busy) return false;
    setBusy(true);
    try {
      const result = await operation();
      if (!result.ok) {
        onMessage(result.error.message);
        return false;
      }
      if ("publication_state" in result.data) onChange(result.data);
      onMessage(successMessage);
      return true;
    } finally {
      setBusy(false);
    }
  };

  const changeState = async (command: ChallengePublicationCommand, successMessage: string) => {
    const changed = await run(
      () => gateway.changePublicationState(challenge.id, command, publicationReason.trim()),
      successMessage,
    );
    if (changed) setPublicationReason("");
  };

  return (
    <section
      className="challenge-live-call"
      aria-labelledby="challenge-live-call-title"
      data-publication-state={publicationState}
    >
      <header>
        <div>
          <h2 id="challenge-live-call-title">مدیریت فراخوان منتشرشده</h2>
          <p>تغییرات این بخش روی فراخوان عمومی اعمال و همراه دلیل ثبت می‌شوند.</p>
        </div>
        <span className="challenge-live-call__state">{stateLabels[publicationState]}</span>
      </header>
      <dl>
        <div>
          <dt>مهلت فعلی ارسال پیشنهاد</dt>
          <dd>
            {formatDateTime(challenge.proposal_deadline_at ?? undefined)}{" "}
            <small>{tehranTimeLabel}</small>
          </dd>
        </div>
        <div>
          <dt>نسخه جاری پرونده</dt>
          <dd>{challenge.version.toLocaleString("fa-IR")}</dd>
        </div>
      </dl>

      {canManage ? (
        <>
          {publicationState === "open" && (
            <form
              className="challenge-live-call__form"
              onSubmit={(event) => {
                event.preventDefault();
                // `datetime-local` carries no zone, so the browser would read
                // it in the publisher's own. Solvers were promised a Tehran
                // deadline, so that is what the entered wall clock means.
                const deadlineIso = tehranWallClockToIso(proposalDeadline);
                if (!deadlineIso) {
                  onMessage("مهلت تازه را با تاریخ و ساعت معتبر وارد کنید.");
                  return;
                }
                void (async () => {
                  const extended = await run(
                    () => gateway.extendDeadline(challenge.id, deadlineIso, extensionReason.trim()),
                    "مهلت تازه با موفقیت ثبت شد.",
                  );
                  if (extended) {
                    setProposalDeadline("");
                    setExtensionReason("");
                  }
                })();
              }}
            >
              <label className="challenge-field">
                <span className="challenge-field__label">
                  مهلت تازه ({tehranTimeLabel}) <b aria-label="الزامی">*</b>
                </span>
                <input
                  type="datetime-local"
                  value={proposalDeadline}
                  required
                  onChange={(event) => setProposalDeadline(event.target.value)}
                />
                <small>
                  تاریخ و ساعت {tehranTimeLabel} تفسیر می‌شود. مهلت فقط رو به جلو تمدید می‌شود؛ زمان
                  سرور ملاک نهایی است.
                </small>
              </label>
              <label className="challenge-field">
                <span className="challenge-field__label">
                  دلیل تمدید <b aria-label="الزامی">*</b>
                </span>
                <input
                  value={extensionReason}
                  required
                  maxLength={2000}
                  onChange={(event) => setExtensionReason(event.target.value)}
                />
              </label>
              <button
                type="submit"
                className="challenge-button challenge-button--secondary"
                disabled={busy || !extensionReason.trim()}
              >
                تمدید مهلت
              </button>
            </form>
          )}

          {(publicationState === "open" || publicationState === "paused") && (
            <div className="challenge-live-call__actions">
              <label className="challenge-field">
                <span className="challenge-field__label">
                  دلیل اقدام <b aria-label="الزامی">*</b>
                </span>
                <textarea
                  rows={3}
                  required
                  maxLength={2000}
                  value={publicationReason}
                  onChange={(event) => setPublicationReason(event.target.value)}
                />
                <small>این دلیل در سابقه حسابرسی فراخوان نگه داشته می‌شود.</small>
              </label>
              <div>
                {publicationState === "open" ? (
                  <button
                    type="button"
                    className="challenge-button challenge-button--secondary"
                    disabled={busy || !publicationReason.trim()}
                    onClick={() => void changeState("pause", "فراخوان موقتاً متوقف شد.")}
                  >
                    توقف موقت
                  </button>
                ) : (
                  <button
                    type="button"
                    className="challenge-button challenge-button--primary"
                    disabled={busy || !publicationReason.trim()}
                    onClick={() => void changeState("resume", "پذیرش پیشنهاد از سر گرفته شد.")}
                  >
                    ازسرگیری فراخوان
                  </button>
                )}
                <button
                  type="button"
                  className="challenge-button challenge-button--secondary"
                  disabled={busy || !publicationReason.trim()}
                  onClick={() => setTerminalCommand("close")}
                >
                  بستن فراخوان
                </button>
                <button
                  type="button"
                  className="challenge-button challenge-button--danger"
                  disabled={busy || !publicationReason.trim()}
                  onClick={() => setTerminalCommand("cancel")}
                >
                  لغو فراخوان
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <small className="challenge-disabled-reason">
          فقط نقش منتشرکننده سازمان می‌تواند وضعیت فراخوان را تغییر دهد.
        </small>
      )}

      <ConfirmModal
        open={terminalCommand !== null}
        title={terminalCommand === "cancel" ? "لغو قطعی فراخوان؟" : "بستن قطعی فراخوان؟"}
        description={
          <>
            <p>این اقدام نهایی است و فراخوان دوباره باز نمی‌شود.</p>
            <p>دلیل ثبت‌شونده: {publicationReason}</p>
          </>
        }
        confirmLabel={terminalCommand === "cancel" ? "تأیید لغو" : "تأیید بستن"}
        danger
        onCancel={() => setTerminalCommand(null)}
        onConfirm={() => {
          const command = terminalCommand;
          setTerminalCommand(null);
          if (command) {
            void changeState(
              command,
              command === "cancel" ? "فراخوان لغو شد." : "فراخوان بسته شد.",
            );
          }
        }}
      />
    </section>
  );
}
