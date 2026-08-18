"use client";

import Link from "next/link";
import { Icon } from "@/components/icons";
import { useSolverContext, type SolverSpace } from "@/components/solver-shell";
import type { InternalRoute } from "@/data/internal-routes";
import { buildSolverHref } from "@/lib/solver/context";

/**
 * Safe fallback for old solver route descriptors. Stateful solver experiences are
 * dispatched to their canonical repository-backed components in InternalApp.
 */
export function SolverWorkflowExperience({
  route,
  space,
}: {
  route: InternalRoute;
  space: SolverSpace;
}) {
  const context = useSolverContext();
  const destinations = [
    {
      href: "/app/solver/opportunities",
      label: "بررسی فرصت‌ها و شرایط مشارکت",
      description: "Eligibility هر فرصت از قواعد ساخت‌یافته و workspace فعال محاسبه می‌شود.",
    },
    {
      href: "/app/solver/cases",
      label: "بازکردن پرونده‌های همکاری",
      description: "پیام، قرارداد، پایلوت، تحویل و پرداخت در هاب همان پرونده قرار دارند.",
    },
    {
      href: "/app/solver/notifications",
      label: "مشاهده اعلان‌ها",
      description: "اقدام‌های لازم و deep linkها از Notification Store مشترک ساخته می‌شوند.",
    },
  ];
  return <>
    <header className="rh-profile-heading"><div><nav aria-label="مسیر صفحه"><Link href={buildSolverHref("/app/solver/dashboard", context)}>فضای کاری</Link><span>/</span><span>{route.title}</span></nav><h1>{route.title}</h1><p>{route.summary}</p><small>فضای فعال: {space === "team" ? "تیمی" : "شخصی"}</small></div></header>
    <section className="rh-card rh-team-origin-note" role="status"><Icon name="history" /><div><h2>این مقصد به جریان canonical منتقل شده است</h2><p>برای جلوگیری از نمایش داده یا کنترل مستقل، ادامه کار را از یکی از مقصدهای وابسته به رکورد انجام دهید.</p></div></section>
    <section className="rh-saved-grid" aria-label="مقصدهای مرتبط">{destinations.map((item) => <article className="rh-card rh-saved-card" key={item.href}><header><span className="rh-saved-card__logo"><Icon name="brief" /></span><div><h2>{item.label}</h2><p>{item.description}</p></div></header><footer><Link href={buildSolverHref(item.href, context)}>ادامه در مقصد مرتبط</Link></footer></article>)}</section>
  </>;
}
