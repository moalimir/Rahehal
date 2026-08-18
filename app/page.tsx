"use client";

import { useEffect, useState } from "react";
import { LandingPage } from "@/components/landing";
import { ChallengeDiscoveryApp } from "@/components/challenge-discovery";
import { ChallengeFlowApp } from "@/components/challenge-flow/challenge-flow-app";
import { InternalApp } from "@/components/internal/internal-app";
import { PortalPage } from "@/components/portal-page";
import { LegacyRedirect } from "@/components/legacy-redirect";
import { LegacyUnavailable, ProductNotFound, RouteResolving } from "@/components/route-fallbacks";
import { getChallengeFlowRoute, type ChallengeFlowRoute } from "@/data/challenge-flow-routes";
import { getInternalRoute, type InternalRoute } from "@/data/internal-routes";
import { getPublicProductRoute } from "@/data/public-product-routes";
import { routeDefinitions } from "@/data/routes";
import { getLegacyResolution, type LegacyUnavailableResolution } from "@/data/legacy-redirects";
import {
  shouldHandleStandaloneAnchor,
  standaloneDestination,
  standalonePathFromHash,
} from "@/lib/routing/standalone-navigation";
import type { RouteDefinition } from "@/types";

type StandaloneRoute =
  | { kind: "discovery"; challengeKey?: string }
  | { kind: "challenge"; route: ChallengeFlowRoute }
  | { kind: "internal"; route: InternalRoute }
  | { kind: "portal"; route: RouteDefinition }
  | { kind: "redirect"; target: string }
  | { kind: "unavailable"; resolution: LegacyUnavailableResolution }
  | { kind: "not-found"; path: string }
  | { kind: "resolving" }
  | null;

function routeRenderKey(route: StandaloneRoute): string {
  if (!route) return "/";
  if (route.kind === "discovery")
    return route.challengeKey ? `/challenges/${route.challengeKey}` : "/challenges";
  if (route.kind === "challenge" || route.kind === "internal" || route.kind === "portal")
    return route.route.path;
  if (route.kind === "redirect") return `redirect:${route.target}`;
  if (route.kind === "unavailable") return `unavailable:${route.resolution.source}`;
  if (route.kind === "not-found") return `not-found:${route.path}`;
  return "resolving";
}

export default function HomePage() {
  const [standaloneRoute, setStandaloneRoute] = useState<StandaloneRoute>(null);

  useEffect(() => {
    let revealGeneration = 0;
    let revealFrame = 0;
    const revealWhenCommitted = (expectedKey: string, generation: number, attempt = 0) => {
      revealFrame = window.requestAnimationFrame(() => {
        const root = document.querySelector<HTMLElement>("[data-standalone-current]");
        const routeCommitted = root?.dataset.standaloneCurrent === expectedKey;
        const routeResolved = !root?.querySelector(".route-fallback--loading");
        if (generation !== revealGeneration) return;
        if ((routeCommitted && routeResolved) || attempt >= 240) {
          document.documentElement.dataset.standaloneReady = "true";
          return;
        }
        revealWhenCommitted(expectedKey, generation, attempt + 1);
      });
    };
    const sync = () => {
      if (document.documentElement.dataset.challengeStandalone !== "true") return;
      delete document.documentElement.dataset.standaloneReady;
      const commit = (next: StandaloneRoute) => {
        const generation = ++revealGeneration;
        setStandaloneRoute(next);
        revealWhenCommitted(routeRenderKey(next), generation);
      };
      if (!window.location.hash.startsWith("#/")) {
        commit(null);
        return;
      }
      const path = standalonePathFromHash(window.location.hash);
      const legacy = getLegacyResolution(path);
      if (legacy?.kind === "redirect") {
        commit({ kind: "redirect", target: legacy.target });
        return;
      }
      if (legacy?.kind === "unavailable") {
        commit({ kind: "unavailable", resolution: legacy });
        return;
      }
      if (path === "/challenges" || path.startsWith("/challenges/")) {
        commit({
          kind: "discovery",
          challengeKey: path === "/challenges" ? undefined : path.split("/").filter(Boolean).at(-1),
        });
        return;
      }
      const challengeRoute = getChallengeFlowRoute(path);
      if (challengeRoute) {
        commit({ kind: "challenge", route: challengeRoute });
        return;
      }
      const internalRoute = getInternalRoute(path);
      if (internalRoute) {
        commit({ kind: "internal", route: internalRoute });
        return;
      }
      const portalRoute =
        getPublicProductRoute(path) ?? routeDefinitions.find((route) => route.path === path);
      commit(portalRoute ? { kind: "portal", route: portalRoute } : { kind: "not-found", path });
    };
    sync();
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => {
      revealGeneration += 1;
      window.cancelAnimationFrame(revealFrame);
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);

  return (
    <div
      data-standalone-current={routeRenderKey(standaloneRoute)}
      onClickCapture={(event) => {
        if (document.documentElement.dataset.challengeStandalone !== "true") return;
        const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>("a[href]");
        if (!anchor || !shouldHandleStandaloneAnchor(event.nativeEvent, anchor)) return;
        const href = anchor?.getAttribute("href") ?? "";
        event.preventDefault();
        event.stopPropagation();
        window.location.hash = standaloneDestination(href);
        window.scrollTo({ top: 0, behavior: "auto" });
      }}
    >
      {standaloneRoute?.kind === "redirect" ? (
        <LegacyRedirect target={standaloneRoute.target} />
      ) : standaloneRoute?.kind === "unavailable" ? (
        <LegacyUnavailable resolution={standaloneRoute.resolution} />
      ) : standaloneRoute?.kind === "not-found" ? (
        <ProductNotFound requestedPath={standaloneRoute.path} />
      ) : standaloneRoute?.kind === "resolving" ? (
        <RouteResolving />
      ) : standaloneRoute?.kind === "discovery" ? (
        <ChallengeDiscoveryApp challengeKey={standaloneRoute.challengeKey} publicMode />
      ) : standaloneRoute?.kind === "challenge" ? (
        <ChallengeFlowApp route={standaloneRoute.route} />
      ) : standaloneRoute?.kind === "internal" ? (
        <InternalApp route={standaloneRoute.route} />
      ) : standaloneRoute?.kind === "portal" ? (
        <PortalPage definition={standaloneRoute.route} />
      ) : (
        <LandingPage />
      )}
    </div>
  );
}
