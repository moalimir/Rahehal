"use client";

import Link from "next/link";

/**
 * Says plainly that a page's contents are sample data.
 *
 * Only the connected runtime shows it. The static export is a demo end to end
 * and already says so; it is the connected build that needs the line drawn,
 * because there the same shell holds pages that read PostgreSQL and pages that
 * read a fixture array, and nothing on screen distinguished them. A signed-in
 * owner was being greeted by a different person's name above numbers that
 * disagreed with their own challenge list.
 *
 * It names where the real data is rather than only what this page is not: a
 * disclaimer that leaves someone stuck is only half an answer.
 */
export function PreviewDataNotice() {
  return (
    <aside className="org-preview-notice" role="note">
      <span className="org-preview-notice__tag">داده نمونه</span>
      <p>
        ارقام، نام‌ها و ردیف‌های این صفحه نمونه‌اند و از سرور خوانده نمی‌شوند. بخش‌های متصل به
        پایگاه داده عبارت‌اند از مسئله‌ها، دروازه‌های انتشار و فراخوان عمومی.
      </p>
      <Link className="org-preview-notice__link" href="/app/org/challenges">
        رفتن به مسئله‌های واقعی سازمان
      </Link>
    </aside>
  );
}
