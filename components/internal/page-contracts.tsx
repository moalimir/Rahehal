"use client";

import { useEffect } from "react";
import type { SolverSpace } from "@/components/solver-shell";
import type { InternalRoute } from "@/data/internal-routes";

export type ActionHandler = (
  label: string,
  options?: { sensitive?: boolean; reason?: boolean },
) => void;

export type PageProps = { route: InternalRoute; onAction: ActionHandler; space?: SolverSpace };

export const statusTone = (
  value: string,
): "success" | "warning" | "danger" | "info" | "neutral" => {
  if (/کامل|پذیرفته|در مسیر|بدون تعارض|پرداخت‌شده/.test(value)) return "success";
  if (/فوری|گذشته|متوقف|رد|ناموفق/.test(value)) return "danger";
  if (/انتظار|نیازمند|بررسی|تعارض|باز/.test(value)) return "warning";
  if (/جاری|داوری|منتشر/.test(value)) return "info";
  return "neutral";
};

export function SyncQuery({ query }: { query: Record<string, string> }) {
  useEffect(() => {
    const url = new URL(window.location.href);
    Object.entries(query).forEach(([key, value]) =>
      value ? url.searchParams.set(key, value) : url.searchParams.delete(key),
    );
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);
  }, [query]);
  return null;
}
