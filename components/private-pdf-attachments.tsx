"use client";

import dynamic from "next/dynamic";
import { useWebRuntime } from "@/components/runtime-provider";
import type { PrivatePdfAttachmentsProps } from "./private-pdf-attachments-panel";

const Panel = dynamic(
  () => import("./private-pdf-attachments-panel").then((module) => module.PrivatePdfAttachments),
  {
    loading: () => <p role="status">در حال دریافت پیوست‌های خصوصی…</p>,
  },
);

export function PrivatePdfAttachments(props: PrivatePdfAttachmentsProps) {
  const runtime = useWebRuntime();
  if (runtime.mode !== "network") return null;
  return <Panel {...props} />;
}
