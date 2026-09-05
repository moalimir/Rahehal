import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChallengeFlowApp } from "@/components/challenge-flow/challenge-flow-app";
import { InternalApp } from "@/components/internal/internal-app";
import { WorkspaceResolver } from "@/components/internal/workspace-resolver";
import { PortalPage } from "@/components/portal-page";
import { ChallengeDiscoveryApp } from "@/components/challenge-discovery";
import { PublicChallengeRecordRoute } from "@/components/public-challenge-record";
import { PUBLIC_CHALLENGE_RECORD_PATH } from "@/lib/challenges/navigation";
import { LegacyRedirect } from "@/components/legacy-redirect";
import { LegacyUnavailable } from "@/components/route-fallbacks";
import {
  challengeFlowMetadata,
  challengeFlowStaticPaths,
  getChallengeFlowRoute,
} from "@/data/challenge-flow-routes";
import { getInternalRoute, internalRoutes } from "@/data/internal-routes";
import { getPublicProductRoute, publicProductRoutes } from "@/data/public-product-routes";
import { routeDefinitions } from "@/data/routes";
import { challenges } from "@/data/mock";
import { CHALLENGE_ROUTE_IDS } from "@/lib/challenges/ids";
import { isNetworkWebRuntime } from "@/lib/runtime/mode";
import { WORKSPACE_RESOLVER_PATH } from "@/lib/routing/workspace-home";
import { getLegacyResolution, legacyRouteEntries } from "@/data/legacy-redirects";

export const dynamicParams = false;

export function generateStaticParams() {
  const publicRoutes = routeDefinitions.filter((route) => route.role === "public");
  const paths = new Set([
    ...publicRoutes.map((route) => route.path),
    ...publicProductRoutes.map((route) => route.path),
    ...internalRoutes.map((route) => route.path),
    // The single authenticated entry point. It resolves the active workspace
    // at request time, so it is a registered route rather than a fallback
    // string other surfaces link to hopefully.
    WORKSPACE_RESOLVER_PATH,
    ...challengeFlowStaticPaths,
    ...legacyRouteEntries.map((entry) => entry.source),
    "/challenges",
    PUBLIC_CHALLENGE_RECORD_PATH,
    ...challenges.flatMap((challenge) => [
      `/challenges/${challenge.slug}`,
      `/challenges/${challenge.id}`,
    ]),
    ...CHALLENGE_ROUTE_IDS.map((id) => `/challenges/${id}`),
  ]);
  return [...paths].map((path) => ({ slug: path.split("/").filter(Boolean) }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const path = `/${slug.join("/")}`;
  const legacy = getLegacyResolution(path);
  if (legacy?.kind === "redirect")
    return {
      title: "انتقال به مسیر استاندارد",
      description: "انتقال پایدار به پوسته جدید راه‌حل.",
    };
  if (legacy?.kind === "unavailable")
    return { title: legacy.title, description: legacy.description };
  if (path === "/challenges") {
    return {
      title: "کشف چالش‌های واقعی",
      description: "جست‌وجو، فیلتر و مقایسه فراخوان‌های منتشرشده راه‌حل.",
    };
  }
  if (path.startsWith("/challenges/")) {
    return { title: "جزئیات چالش", description: "شرح، شرایط مشارکت و وضعیت چالش." };
  }
  if (path === WORKSPACE_RESOLVER_PATH) {
    return {
      title: "ورود به فضای کاری",
      description: "انتخاب و ورود به فضای کاری فعال حساب کاربری.",
    };
  }
  const flowRoute = getChallengeFlowRoute(path);
  if (flowRoute) {
    const meta = challengeFlowMetadata(flowRoute);
    return { title: meta.title, description: meta.summary };
  }
  const route =
    getInternalRoute(path) ??
    getPublicProductRoute(path) ??
    routeDefinitions.find((definition) => definition.path === path);

  if (!route) return {};
  return { title: route.title, description: route.summary };
}

export default async function RoutedPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const path = `/${slug.join("/")}`;
  const legacy = getLegacyResolution(path);
  if (legacy?.kind === "redirect") return <LegacyRedirect target={legacy.target} />;
  if (legacy?.kind === "unavailable") return <LegacyUnavailable resolution={legacy} />;
  if (path === "/challenges") return <ChallengeDiscoveryApp publicMode />;
  // Connected builds address a published challenge by query, like the org
  // record path does: server ids cannot be pre-generated at build time.
  if (path === PUBLIC_CHALLENGE_RECORD_PATH) return <PublicChallengeRecordRoute />;
  if (path.startsWith("/challenges/")) {
    // Fixture detail routes belong only to the static demo. A connected build
    // must never expose them as an apparent production record.
    if (isNetworkWebRuntime) notFound();
    return (
      <ChallengeDiscoveryApp challengeKey={path.split("/").filter(Boolean).at(-1)} publicMode />
    );
  }
  if (path === WORKSPACE_RESOLVER_PATH) return <WorkspaceResolver />;
  const challengeFlowRoute = getChallengeFlowRoute(path);
  if (challengeFlowRoute) return <ChallengeFlowApp route={challengeFlowRoute} />;
  const internalRoute = getInternalRoute(path);
  if (internalRoute) return <InternalApp route={internalRoute} />;
  const definition =
    getPublicProductRoute(path) ?? routeDefinitions.find((route) => route.path === path);
  if (!definition) notFound();
  return <PortalPage definition={definition} />;
}
