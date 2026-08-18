"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SolverProposalWizard } from "@/components/solver-proposal-wizard";
import type { InternalRoute } from "@/data/internal-routes";
import { canAccessReviewMaterials, getReviewCoi } from "@/lib/reviews/access";
import { Panel } from "@/components/internal/shared";
import {
  DashboardPage,
  ChallengeListPage,
  IntakePage,
  VerificationPage,
  TriagePage,
  StudioPage,
} from "@/components/internal/organization-pages";
import {
  CaseOverviewPage,
  TimelinePage,
  ExpertsPage,
  ProposalInboxPage,
  ProposalComparePage,
  ReviewRoomPage,
  DecisionRoomPage,
  ContractPage,
  PilotPage,
  DeliverablePage,
  FinancePage,
  ImpactPage,
} from "@/components/internal/case-pages";
import { OpportunitiesPage, ResourcePage } from "@/components/internal/resource-pages";
import { ReviewerPage } from "@/components/internal/reviewer-pages";
import { OpsPage } from "@/components/internal/operations-pages";
import type { PageProps } from "@/components/internal/page-contracts";

export type { ActionHandler } from "@/components/internal/page-contracts";

function ReviewerProtected({
  route,
  children,
}: {
  route: InternalRoute;
  children: React.ReactNode;
}) {
  const assignmentId = route.path.match(/\/assignments\/([^/]+)/)?.[1];
  const [coi, setCoi] = useState<ReturnType<typeof getReviewCoi> | null>(null);
  useEffect(() => setCoi(assignmentId ? getReviewCoi(assignmentId) : "pending"), [assignmentId]);
  if (coi === null) {
    return (
      <Panel title="در حال بررسی مجوز" eyebrow="کنترل دسترسی">
        <p aria-live="polite">وضعیت اظهار تعارض در حال بررسی است.</p>
      </Panel>
    );
  }
  if (!canAccessReviewMaterials(coi)) {
    return (
      <Panel title="محتوای داوری هنوز در دسترس نیست" eyebrow="کنترل تعارض منافع">
        <p>
          پیش از مشاهده مدارک، مقایسه یا امتیازدهی باید نبود تعارض منافع را ثبت کنید. در صورت ثبت
          تعارض، دسترسی تا بررسی عملیات بسته می‌ماند.
        </p>
        <Link
          className="app-button app-button--primary"
          href={`/app/reviewer/assignments/${assignmentId ?? "RV-204"}/conflict`}
        >
          تکمیل اظهار تعارض
        </Link>
      </Panel>
    );
  }
  return <>{children}</>;
}

export function InternalPage({ route, onAction, space }: PageProps) {
  switch (route.experience) {
    case "dashboard":
      return <DashboardPage route={route} onAction={onAction} />;
    case "challenge-list":
      return <ChallengeListPage route={route} onAction={onAction} />;
    case "intake":
      return <IntakePage route={route} onAction={onAction} />;
    case "verification":
      return <VerificationPage route={route} onAction={onAction} />;
    case "triage":
      return <TriagePage route={route} onAction={onAction} />;
    case "studio":
      return <StudioPage route={route} onAction={onAction} />;
    case "case-overview":
      return <CaseOverviewPage route={route} onAction={onAction} />;
    case "timeline":
      return <TimelinePage route={route} onAction={onAction} />;
    case "experts":
      return <ExpertsPage route={route} onAction={onAction} />;
    case "proposal-inbox":
      return <ProposalInboxPage route={route} onAction={onAction} />;
    case "proposal-compare":
      return route.role === "reviewer" ? (
        <ReviewerProtected route={route}>
          <ProposalComparePage route={route} onAction={onAction} />
        </ReviewerProtected>
      ) : (
        <ProposalComparePage route={route} onAction={onAction} />
      );
    case "review-room":
      return <ReviewRoomPage route={route} onAction={onAction} />;
    case "decision-room":
      return <DecisionRoomPage route={route} onAction={onAction} />;
    case "contract":
      return <ContractPage route={route} onAction={onAction} />;
    case "pilot":
      return <PilotPage route={route} onAction={onAction} />;
    case "deliverable":
      return <DeliverablePage route={route} onAction={onAction} />;
    case "finance":
      return <FinancePage route={route} onAction={onAction} />;
    case "impact":
      return <ImpactPage route={route} onAction={onAction} />;
    case "documents":
      return route.role === "reviewer" ? (
        <ReviewerProtected route={route}>
          <ResourcePage route={route} onAction={onAction} />
        </ReviewerProtected>
      ) : (
        <ResourcePage route={route} onAction={onAction} />
      );
    case "conversations":
    case "audit":
    case "reports":
    case "team":
    case "settings":
    case "profile":
    case "eligibility":
    case "data-room":
    case "reputation":
      return <ResourcePage route={route} onAction={onAction} />;
    case "opportunities":
    case "invitations":
      return <OpportunitiesPage route={route} onAction={onAction} />;
    case "proposal-builder":
      return (
        <SolverProposalWizard
          path={route.path}
          space={space ?? "individual"}
          onSubmit={() => undefined}
        />
      );
    case "proposal-status":
      return <ResourcePage route={route} onAction={onAction} />;
    case "reviewer-queue":
    case "reviewer-conflict":
      return <ReviewerPage route={route} onAction={onAction} />;
    case "reviewer-score":
    case "reviewer-submit":
      return (
        <ReviewerProtected route={route}>
          <ReviewerPage route={route} onAction={onAction} />
        </ReviewerProtected>
      );
    case "ops-queue":
    case "ops-kyc":
    case "ops-quality":
    case "ops-review":
    case "ops-moderation":
    case "ops-dispute":
    case "ops-payment":
    case "ops-support":
    case "ops-system":
      return <OpsPage route={route} onAction={onAction} />;
    default:
      return <ResourcePage route={route} onAction={onAction} />;
  }
}
