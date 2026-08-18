"use client";

import { useEffect, useState } from "react";
import { ChallengeDetailPage } from "@/components/challenge-flow/detail-page";
import { ChallengeEditPage } from "@/components/challenge-flow/edit-page";
import { ChallengeIntakePage } from "@/components/challenge-flow/intake-page";
import { ChallengeListPage } from "@/components/challenge-flow/list-page";
import { ChallengePreviewPage } from "@/components/challenge-flow/preview-page";
import { ChallengeSubmittedPage } from "@/components/challenge-flow/submitted-page";
import { LegacyRedirect } from "@/components/legacy-redirect";
import { OrganizationShell } from "@/components/role-shells";
import { getChallengeFlowRoute, type ChallengeFlowRoute } from "@/data/challenge-flow-routes";
import { navigateChallenge, readStandalonePath } from "@/lib/challenges/navigation";

export function ChallengeFlowApp({ route: initialRoute }: { route: ChallengeFlowRoute }) {
  const [route, setRoute] = useState(initialRoute);
  useEffect(() => {
    const sync = () => {
      const standalone = readStandalonePath();
      if (!standalone) return;
      const next = getChallengeFlowRoute(standalone.pathname);
      if (next) setRoute(next);
    };
    sync();
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);

  if (route.kind === "redirect") return <LegacyRedirect target={route.target} />;

  const content =
    route.kind === "new" ? (
      <ChallengeIntakePage />
    ) : route.kind === "list" ? (
      <ChallengeListPage />
    ) : route.kind === "edit" ? (
      <ChallengeEditPage id={route.id} />
    ) : route.kind === "preview" ? (
      <ChallengePreviewPage id={route.id} />
    ) : route.kind === "submitted" ? (
      <ChallengeSubmittedPage id={route.id} />
    ) : (
      <ChallengeDetailPage id={route.id} />
    );

  return (
    <div
      onClickCapture={(event) => {
        if (document.documentElement.dataset.challengeStandalone !== "true") return;
        const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>("a[href]");
        const href = anchor?.getAttribute("href") ?? "";
        if (!href.startsWith("/app/org/challenges") && !href.startsWith("/org/challenges")) return;
        event.preventDefault();
        navigateChallenge(href);
      }}
    >
      <OrganizationShell currentPath={route.path}>{content}</OrganizationShell>
    </div>
  );
}
