"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  ChallengeApprovalResource,
  ChallengeApprovalSummaryResource,
  ChallengeResource,
} from "@rahhal/contracts";
import { gateApproverRoles, publicationGates, type PublicationGate } from "@rahhal/domain";
import { ChallengeLoadErrorState, ChallengeShell } from "@/components/challenge-flow/shell";
import { Toast } from "@/components/challenge-flow/fields";
import { LiveCallControls } from "@/components/challenge-flow/live-call-controls";
import { useChallengeGovernance, useWebRuntime } from "@/components/runtime-provider";
import type { ChallengeGovernanceResource } from "@/lib/challenges/governance";

const gateLabels: Record<PublicationGate, string> = {
  technical: "تأیید فنی",
  legal: "تأیید حقوقی",
  finance: "تأیید مالی",
  quality: "دروازه کیفیت",
};

function isOrganizationChallenge(
  resource: ChallengeGovernanceResource,
): resource is ChallengeResource {
  return "publication_state" in resource;
}

/**
 * Which gate this actor may record, inverted from the domain's own
 * `gateApproverRoles` rather than restated here — a second copy of that policy
 * would drift from the server's. Presentation only: the server re-decides
 * every gate, and the negative tests assert the refusal comes from there.
 */
function gateForRole(role: string): PublicationGate | undefined {
  return publicationGates.find((gate) =>
    (gateApproverRoles[gate] as readonly string[]).includes(role),
  );
}

function GateRow({
  gate,
  approval,
}: {
  gate: PublicationGate;
  approval: ChallengeApprovalResource | ChallengeApprovalSummaryResource | undefined;
}) {
  return (
    <li className="challenge-gate-row">
      <span className="challenge-gate-row__name">{gateLabels[gate]}</span>
      {approval ? (
        <span className="challenge-gate-row__state" data-decision={approval.decision}>
          {approval.decision === "approved" ? "تأییدشده" : "ردشده"} ·{" "}
          <bdi>{"recorded_by" in approval ? approval.recorded_by : approval.recorded_by_role}</bdi>
          <small>{approval.reason}</small>
        </span>
      ) : (
        <span className="challenge-gate-row__state" data-decision="pending">
          در انتظار ثبت
        </span>
      )}
    </li>
  );
}

export function ChallengeGovernancePage({
  id,
  targetWorkspaceId,
}: {
  id: string;
  /** Set when a platform gate approver opens a challenge it has no membership in. */
  targetWorkspaceId?: string;
}) {
  const governance = useChallengeGovernance();
  const { me } = useWebRuntime();
  const [resource, setResource] = useState<ChallengeGovernanceResource | null>(null);
  const [loadError, setLoadError] = useState("");
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    if (!governance) return;
    const result = await governance.read(id, targetWorkspaceId);
    if (!result.ok) {
      setLoadError(result.error.message);
      return;
    }
    setLoadError("");
    setResource(result.data);
  }, [governance, id, targetWorkspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  // The demo store has no attributed-gate model. Saying so is the honest
  // answer; simulating gates locally would be exactly the demo fallback the
  // production path forbids.
  if (!governance) {
    return (
      <ChallengeShell title="دروازه‌های انتشار">
        <p className="challenge-empty-state">
          ثبت دروازه‌های انتشار فقط در اجرای متصل به سرور در دسترس است.
        </p>
      </ChallengeShell>
    );
  }
  if (loadError) return <ChallengeLoadErrorState message={loadError} />;
  if (!resource) {
    return (
      <ChallengeShell title="دروازه‌های انتشار">
        <p className="challenge-empty-state">در حال دریافت وضعیت پرونده…</p>
      </ChallengeShell>
    );
  }

  // `/me` carries the role on the membership, not on the active context, so
  // the active workspace's own membership is the authority for what this
  // actor may attempt here.
  const activeWorkspaceId = me?.active_context?.workspace_id;
  // A platform approver has no membership in the target workspace and often no
  // active context at all, so fall back to its own active platform membership.
  const role =
    (
      me?.memberships.find(
        (membership) =>
          membership.workspace_id === activeWorkspaceId && membership.state === "active",
      ) ?? me?.memberships.find((membership) => membership.state === "active")
    )?.role ?? "";
  const actorGate = gateForRole(role);
  const recorded = new Map(resource.approvals.map((approval) => [approval.gate, approval]));
  const readiness = resource.publication_readiness;
  const alreadyRecordedByActor = resource.approvals.some(
    (approval) =>
      ("recorded_by" in approval && approval.recorded_by === me?.user.id) ||
      ("recorded_by_current_actor" in approval && approval.recorded_by_current_actor),
  );
  const canRecord =
    Boolean(actorGate) &&
    resource.stage === "approvals" &&
    !recorded.has(actorGate!) &&
    !alreadyRecordedByActor;
  const canPublish = role === "org:publisher" && readiness.ready && resource.stage === "approvals";
  const organizationChallenge = isOrganizationChallenge(resource) ? resource : null;

  const run = async (
    operation: () => Promise<{ ok: boolean; error?: { message: string } }>,
    successMessage = "",
  ) => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await operation();
      if (!result.ok) setToast(result.error?.message ?? "اقدام انجام نشد.");
      else setToast(successMessage);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ChallengeShell
      title="دروازه‌های انتشار"
      description="هر دروازه به یک تأییدکننده متمایز نسبت داده می‌شود و روی همین نسخه ثبت می‌ماند."
      id={resource.id}
    >
      <section className="challenge-review-brief" aria-labelledby="challenge-review-brief-title">
        <h2 id="challenge-review-brief-title">{resource.content.title}</h2>
        <p>{resource.content.summary}</p>
        <dl>
          <div>
            <dt>نتیجه مورد انتظار</dt>
            <dd>{resource.content.desired_outcome}</dd>
          </div>
          <div>
            <dt>دامنه</dt>
            <dd>{resource.content.in_scope}</dd>
          </div>
          <div>
            <dt>محدودیت‌ها</dt>
            <dd>{resource.content.constraints || "ثبت نشده"}</dd>
          </div>
          <div>
            <dt>شرایط حقوقی</dt>
            <dd>{resource.content.legal_notes || "ثبت نشده"}</dd>
          </div>
        </dl>
      </section>

      <ul className="challenge-gate-list" aria-label="وضعیت دروازه‌های انتشار">
        {publicationGates.map((gate) => (
          <GateRow key={gate} gate={gate} approval={recorded.get(gate)} />
        ))}
      </ul>

      {canRecord && actorGate && (
        <form
          className="challenge-gate-form"
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              const result = await governance.recordApproval(
                id,
                { gate: actorGate, decision: "approved", reason: reason.trim() },
                targetWorkspaceId,
              );
              if (result.ok) {
                setResource(result.data);
                setReason("");
              }
              return result;
            });
          }}
        >
          <label htmlFor="gate-reason">دلیل ثبت {gateLabels[actorGate]}</label>
          <textarea
            id="gate-reason"
            value={reason}
            required
            minLength={1}
            maxLength={2000}
            onChange={(event) => setReason(event.target.value)}
          />
          <button
            type="submit"
            className="challenge-button challenge-button--primary"
            disabled={busy}
          >
            ثبت {gateLabels[actorGate]}
          </button>
        </form>
      )}

      <div className="challenge-gate-publish">
        <button
          type="button"
          className="challenge-button challenge-button--primary"
          disabled={!canPublish || busy}
          onClick={() =>
            void run(async () => {
              const result = await governance.publish(id);
              if (result.ok) setResource(result.data);
              return result;
            })
          }
        >
          انتشار پرونده
        </button>
        {/* A disabled control must say why, not just look inert. */}
        {!canPublish && (
          <small className="challenge-disabled-reason">
            {resource.stage === "published"
              ? "این پرونده منتشر شده است."
              : role !== "org:publisher"
                ? "فقط نقش منتشرکننده سازمان می‌تواند پرونده را منتشر کند."
                : `دروازه‌های باقی‌مانده: ${readiness.missing
                    .map((gate) => gateLabels[gate])
                    .join("، ")}`}
          </small>
        )}
      </div>

      {organizationChallenge && (
        <LiveCallControls
          challenge={organizationChallenge}
          canManage={role === "org:publisher"}
          gateway={governance}
          onChange={setResource}
          onMessage={setToast}
        />
      )}

      <Toast message={toast} />
    </ChallengeShell>
  );
}
