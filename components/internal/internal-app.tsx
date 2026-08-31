"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChallengeDiscoveryApp } from "@/components/challenge-discovery";
import { Icon } from "@/components/icons";
import { LegacyRedirect } from "@/components/legacy-redirect";
import { PlatformApprovalQueue } from "@/components/platform-approval-queue";
import {
  LegacyUnavailable,
  PermissionDenied,
  ProductNotFound,
  RouteResolving,
  SessionRequired,
} from "@/components/route-fallbacks";
import { InternalPage, type ActionHandler } from "@/components/internal/pages";
import {
  isOrganizationWorkspacePath,
  OrganizationWorkspaceExperience,
} from "@/components/organization-workspace";
import { ConfirmDialog, ReceiptPanel, StateNotice } from "@/components/internal/shared";
import { useChallengeGateway } from "@/components/runtime-provider";
import { ConfiguredRoleShell, OrganizationShell } from "@/components/role-shells";
import { SolverDashboardExperience } from "@/components/solver-dashboard";
import { SolverProposalDetail } from "@/components/solver-proposals-list";
import {
  SolverProfileExperience,
  type SolverProfileSection,
} from "@/components/solver-profile-experience";
import { SolverShell, useSolverContextResolution } from "@/components/solver-shell";
import type { SolverSpace } from "@/components/solver-shell";
import { SolverWorkflowExperience } from "@/components/solver-workflow-experience";
import type { InternalRoute } from "@/data/internal-routes";
import { getLegacyResolution } from "@/data/legacy-redirects";
import {
  InternalServiceError,
  performProductAction,
  type ActionReceipt,
  type ServiceMode,
} from "@/lib/services/internal-service";
import { isQaHarnessEnabled } from "@/lib/qa-harness";
import { isNetworkWebRuntime } from "@/lib/runtime/mode";
import { canAccessInternalRole, readDemoSession, type DemoSession } from "@/lib/auth/session";
import { isRecordReady } from "@/lib/challenges/validation";
import { directOfferById, proposalById, readSolverState } from "@/lib/solver/repository";

const SolverCanonicalContinuity = dynamic(
  () =>
    import("@/components/solver-case-continuity").then(
      (module) => module.SolverCanonicalContinuity,
    ),
  { loading: RouteResolving },
);

const canonicalContinuityExperiences = new Set<InternalRoute["experience"]>([
  "notifications",
  "case-hub",
  "verification",
  "data-room",
  "contract",
  "pilot",
  "finance",
  "conversations",
  "audit",
  "reputation",
]);

function shouldUseCanonicalContinuity(route: InternalRoute) {
  return canonicalContinuityExperiences.has(route.experience);
}

type DemoUiState =
  | "default"
  | "loading"
  | "offline"
  | "permission"
  | "conflict"
  | "error"
  | "empty"
  | "closed";

const solverProfileSections: Record<string, SolverProfileSection> = {
  "/app/solver/received-proposals": "received",
  "/app/solver/team-building": "team-building",
  "/app/solver/proposals": "proposals",
  "/app/solver/saved": "saved",
  "/app/solver/invitations": "invitations",
  "/app/solver/teams": "teams",
  "/app/solver/profile": "profile",
  "/app/solver/settings": "settings",
};

export function InternalApp({ route }: { route: InternalRoute }) {
  const legacy = getLegacyResolution(route.path);
  const [session, setSession] = useState<DemoSession | null | undefined>(undefined);
  useEffect(() => {
    if (process.env.NODE_ENV === "test") {
      setSession({
        version: 1,
        userId: `test-${route.role}`,
        role: route.role,
        workspaceId: `test-${route.role}`,
        twoFactorVerified: true,
        expiresAt: Date.now() + 60_000,
      });
      return;
    }
    setSession(readDemoSession());
  }, [route.role]);
  if (legacy?.kind === "redirect") return <LegacyRedirect target={legacy.target} />;
  if (legacy?.kind === "unavailable") return <LegacyUnavailable resolution={legacy} />;
  if (isNetworkWebRuntime && route.path === "/app/ops/publication") {
    return (
      <ConfiguredRoleShell role="ops" currentPath={route.path}>
        <PlatformApprovalQueue />
      </ConfiguredRoleShell>
    );
  }
  if (session === undefined) return <RouteResolving />;
  const sharedRoute =
    /^\/app\/(?:search|tasks|calendar|messages|notifications|documents|help|account)(?:\/|$)/.test(
      route.path,
    );
  if (!session) return <SessionRequired role={route.role} returnTo={route.path} />;
  if (!sharedRoute && !canAccessInternalRole(session, route.role)) return <PermissionDenied />;
  const activeRole = sharedRoute ? session.role : route.role;
  if (activeRole === "solver")
    return <SolverRouteExperience key={`${route.path}:${route.prdId}`} route={route} />;
  if (activeRole === "org") {
    return (
      <OrganizationShell currentPath={route.path}>
        {isOrganizationWorkspacePath(route.path) ? (
          <OrganizationWorkspaceExperience route={route} />
        ) : (
          <InternalExperience route={route} />
        )}
      </OrganizationShell>
    );
  }
  return (
    <ConfiguredRoleShell role={activeRole} currentPath={route.path}>
      <InternalExperience route={route} />
    </ConfiguredRoleShell>
  );
}

function SolverRouteExperience({ route }: { route: InternalRoute }) {
  const resolution = useSolverContextResolution();
  if (!resolution) return <RouteResolving />;
  if (!resolution.ok)
    return resolution.error === "not-found" ? (
      <ProductNotFound requestedPath={route.path} />
    ) : (
      <PermissionDenied />
    );
  const context = resolution.context;
  const space = context.type;
  const state = readSolverState();
  const teamRouteId = route.path.match(/^\/app\/solver\/teams\/([^/]+)$/)?.[1];
  if (teamRouteId) {
    const team = state.teams.find((candidate) => candidate.id === teamRouteId);
    if (!team) return <ProductNotFound requestedPath={route.path} />;
    if (context.type !== "team" || context.teamId !== team.id) return <PermissionDenied />;
  }
  const proposalRouteId = route.path.match(/^\/app\/solver\/proposals\/(PR-[^/]+)\//)?.[1];
  if (proposalRouteId) {
    const proposal = state.proposals.find((candidate) => candidate.id === proposalRouteId);
    if (!proposal) return <ProductNotFound requestedPath={route.path} />;
    if (!proposalById(proposalRouteId, context.workspaceId, state)) return <PermissionDenied />;
  }
  const offerRouteId = route.path.match(/^\/app\/solver\/received-proposals\/([^/]+)\//)?.[1];
  if (offerRouteId) {
    if (!state.directOffers.some((offer) => offer.id === offerRouteId))
      return <ProductNotFound requestedPath={route.path} />;
    if (!directOfferById(offerRouteId, context.workspaceId, state)) return <PermissionDenied />;
  }
  let content: React.ReactNode;
  if (route.path === "/app/solver/dashboard") {
    content = <SolverDashboardExperience embedded space={space} />;
  } else if (route.path === "/app/solver/opportunities") {
    content = <ChallengeDiscoveryApp embedded space={space} />;
  } else if (route.path.startsWith("/app/solver/opportunities/")) {
    content = (
      <ChallengeDiscoveryApp
        challengeKey={route.path.split("/").filter(Boolean).at(-1)}
        embedded
        space={space}
      />
    );
  } else if (
    solverProfileSections[route.path] ||
    route.path.startsWith("/app/solver/teams/") ||
    route.path.startsWith("/app/solver/invitations/") ||
    route.path.startsWith("/app/solver/received-proposals/")
  ) {
    const receivedOfferResponse = route.path.match(
      /^\/app\/solver\/received-proposals\/([^/]+)\/respond$/,
    );
    content = (
      <SolverProfileExperience
        section={
          receivedOfferResponse
            ? "offer-response"
            : route.path === "/app/solver/teams/new"
              ? "team-building"
              : route.path.startsWith("/app/solver/teams/")
                ? "teams"
                : (solverProfileSections[route.path] ?? "invitations")
        }
        embedded
        space={space}
        offerId={receivedOfferResponse?.[1]}
        path={route.path}
      />
    );
  } else if (route.experience === "proposal-status" && proposalRouteId) {
    content = <SolverProposalDetail proposalId={proposalRouteId} />;
  } else if (route.experience === "proposal-builder" || route.experience === "proposal-status") {
    content = <InternalExperience route={route} solverSpace={space} />;
  } else if (shouldUseCanonicalContinuity(route)) {
    content = <SolverCanonicalContinuity route={route} />;
  } else {
    content = <SolverWorkflowExperience route={route} space={space} />;
  }
  return (
    <SolverShell currentPath={route.path} space={space}>
      {content}
    </SolverShell>
  );
}

function InternalExperience({
  route,
  solverSpace,
}: {
  route: InternalRoute;
  solverSpace?: SolverSpace;
}) {
  // The runtime provider picks demo or network persistence; this component
  // must not choose between them (AGENTS.md: components consume gateways).
  const challengeGateway = useChallengeGateway();
  const qaHarnessEnabled =
    typeof window !== "undefined" ? isQaHarnessEnabled(window.location) : false;
  const [uiState, setUiState] = useState<DemoUiState>("default");
  const [receipt, setReceipt] = useState<ActionReceipt | null>(null);
  const [receiptVisible, setReceiptVisible] = useState(false);
  const [pending, setPending] = useState<{ label: string; reason: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [toast, setToast] = useState("");

  const execute = useCallback(
    async (label: string) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      setToast("");
      const mode: ServiceMode =
        uiState === "offline"
          ? "offline"
          : uiState === "conflict"
            ? "conflict"
            : uiState === "error"
              ? "error"
              : "success";
      try {
        const publicationId = route.path.match(/^\/app\/ops\/publication\/(CH-[^/]+)$/)?.[1];
        const publicationResult = publicationId
          ? await challengeGateway.queries.get(publicationId)
          : null;
        if (publicationResult && !publicationResult.ok) {
          throw new InternalServiceError(
            publicationResult.error.message,
            "BLOCKED",
            publicationResult.meta.correlation_id,
          );
        }
        const publicationRecord = publicationResult?.ok ? publicationResult.data : undefined;
        if (
          publicationId &&
          label.includes("انتشار") &&
          (!publicationRecord ||
            !["under_review", "published"].includes(publicationRecord.status) ||
            !isRecordReady(publicationRecord))
        ) {
          throw new InternalServiceError(
            "پرونده هنوز شرایط انتشار را ندارد؛ وضعیت بررسی و کامل‌بودن اطلاعات را کنترل کنید.",
            "BLOCKED",
            `publication:${publicationId}`,
          );
        }
        const nextReceipt = await performProductAction(
          {
            action: label,
            entityRef: route.path,
            actorRole: route.role,
            idempotencyKey: `${route.path}:${label}`,
          },
          mode,
        );
        if (publicationId && publicationRecord?.status === "under_review") {
          const publication = await challengeGateway.commands.publish(publicationId);
          if (!publication.ok) {
            throw new InternalServiceError(
              publication.error.message,
              "BLOCKED",
              publication.meta.correlation_id,
            );
          }
        }
        setReceipt(nextReceipt);
        setReceiptVisible(true);
        setToast(`${label} با موفقیت انجام شد.`);
      } catch (error) {
        if (error instanceof InternalServiceError)
          setToast(`${error.message} · ${error.correlationId}`);
        else setToast("خطای پیش‌بینی‌نشده رخ داد؛ ورودی شما حفظ شده است.");
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [challengeGateway, route.path, route.role, uiState],
  );

  const handleAction: ActionHandler = (label, options) => {
    if (options?.sensitive) setPending({ label, reason: Boolean(options.reason) });
    else void execute(label);
  };
  const ownsPrimaryAction = new Set([
    "proposal-builder",
    "proposal-status",
    "opportunities",
    "invitations",
    "team",
    "settings",
    "profile",
  ]).has(route.experience);
  const finalSubmission = Boolean(
    pending?.label.includes("ارسال نهایی") &&
      (pending.label.includes("پیشنهاد") || pending.label.includes("راه‌حل")),
  );
  const confirmationDescription =
    pending?.label.includes("پیشنهاد") || pending?.label.includes("راه‌حل")
      ? "نسخه فعلی قفل و برای سازمان ارسال می‌شود. پس از ارسال، فقط از مسیر درخواست اصلاح می‌توانید نسخه جدید بسازید."
      : "این اقدام وضعیت پرونده را تغییر می‌دهد، در تاریخچه ثبت می‌شود و اقدام بعدی را برای نقش مسئول می‌سازد.";
  const immersiveProposal =
    route.experience === "proposal-builder" || route.experience === "proposal-status";

  return (
    <>
      {!immersiveProposal && (
        <header className="app-page-header">
          <div>
            <div className="app-inline-meta">
              <bdi dir="ltr" className="app-page-id">
                {route.prdId}
              </bdi>
              <span>{route.eyebrow}</span>
            </div>
            <h1>{route.title}</h1>
            <p>{route.summary}</p>
          </div>
          <div className="app-page-header__actions">
            {qaHarnessEnabled ? (
              <label className="app-state-selector">
                <span>ابزار آزمون وضعیت</span>
                <select
                  value={uiState}
                  onChange={(event) => setUiState(event.target.value as DemoUiState)}
                >
                  <option value="default">عادی</option>
                  <option value="loading">در حال بارگذاری</option>
                  <option value="empty">بدون داده</option>
                  <option value="offline">آفلاین</option>
                  <option value="permission">بدون دسترسی</option>
                  <option value="conflict">تعارض نسخه</option>
                  <option value="error">خطا</option>
                  <option value="closed">بسته‌شده</option>
                </select>
              </label>
            ) : null}
            {!ownsPrimaryAction && (
              <button
                className="app-button app-button--primary"
                disabled={busy || uiState === "permission" || uiState === "closed"}
                onClick={() =>
                  handleAction(route.primaryAction, {
                    sensitive: /ثبت|ارسال|تأیید|تصمیم|پذیرش/.test(route.primaryAction),
                    reason: /تصمیم|پذیرش|رد/.test(route.primaryAction),
                  })
                }
              >
                {busy ? "در حال ثبت…" : route.primaryAction}
                <Icon name="arrow" />
              </button>
            )}
          </div>
        </header>
      )}
      {!immersiveProposal && <StateNotice state={uiState} onReset={() => setUiState("default")} />}
      {receipt && receiptVisible && (
        <ReceiptPanel receipt={receipt} onClose={() => setReceiptVisible(false)} />
      )}
      {receipt && !receiptVisible && (
        <button
          className="app-receipt-reopen"
          type="button"
          onClick={() => setReceiptVisible(true)}
        >
          <Icon name="history" /> نمایش آخرین رسید: <bdi>{receipt.id}</bdi>
        </button>
      )}
      {uiState !== "permission" && uiState !== "empty" && (
        <InternalPage route={route} onAction={handleAction} space={solverSpace} />
      )}
      {toast && (
        <div className="app-toast" role="status">
          <Icon name={toast.includes("خطا") || toast.includes("نشد") ? "notification" : "check"} />
          <span>{toast}</span>
          <button onClick={() => setToast("")} aria-label="بستن پیام">
            <Icon name="close" />
          </button>
        </div>
      )}
      <ConfirmDialog
        open={Boolean(pending)}
        title={
          finalSubmission ? "آماده ارسال نسخه نهایی هستید؟" : (pending?.label ?? "تأیید اقدام")
        }
        description={confirmationDescription}
        confirmLabel={finalSubmission ? "تأیید و ارسال نهایی" : (pending?.label ?? "تأیید")}
        cancelLabel={finalSubmission ? "بازگشت و بررسی دوباره" : "انصراف"}
        variant={finalSubmission ? "submission" : "default"}
        reasonRequired={Boolean(pending?.reason)}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          const label = pending?.label;
          setPending(null);
          if (label) void execute(label);
        }}
      />
    </>
  );
}
