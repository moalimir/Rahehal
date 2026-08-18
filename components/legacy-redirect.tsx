"use client";

import Link from "next/link";
import { useEffect } from "react";
import { RahhalLogo } from "@/components/brand";

function targetWithContext(target: string): string {
  if (typeof window === "undefined") return target;
  if (document.documentElement.dataset.challengeStandalone === "true") {
    const hashQuery = window.location.hash.includes("?")
      ? window.location.hash.slice(window.location.hash.indexOf("?"))
      : "";
    return `${target}${hashQuery}`;
  }
  return `${target}${window.location.search}${window.location.hash}`;
}

export function LegacyRedirect({ target }: { target: string }) {
  useEffect(() => {
    const destination = targetWithContext(target);
    if (document.documentElement.dataset.challengeStandalone === "true") {
      window.location.replace(`#${destination}`);
    } else {
      window.location.replace(destination);
    }
  }, [target]);

  return (
    <main className="legacy-redirect" id="main-content">
      <RahhalLogo size="lg" />
      <h1>در حال انتقال به مسیر استاندارد</h1>
      <p>فضای کاری و اطلاعات نشانی هنگام انتقال حفظ می‌شوند.</p>
      <Link href={target}>ادامه</Link>
    </main>
  );
}
