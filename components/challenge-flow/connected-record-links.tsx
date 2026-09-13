"use client";

import Link from "next/link";

import { challengeHref } from "@/lib/challenges/navigation";
import { isDraftStatus, type ChallengeRecord } from "@/domain/challenge";

/**
 * The onward links a real challenge record has, beyond editing it.
 *
 * Both destinations existed and were authoritative long before anything
 * pointed at them: the publication gates could only be opened by typing their
 * URL, which is how the end-to-end test reaches them and not how a person
 * works. The case pages a fixture challenge links onward to — proposals,
 * review, pilot — are deliberately absent, because no server authority stands
 * behind them yet and pointing a real record at sample data is exactly the
 * fallback the architecture forbids.
 *
 * Connected-only, and aliased out of the demo bundle: in the static export the
 * governance gateway is null and the catalogue is a fixture, so neither link
 * could answer for this record there.
 */
export function ConnectedRecordLinks({ record }: { record: ChallengeRecord }) {
  const governed = !isDraftStatus(record.status);
  const publiclyListed =
    (record.lifecycleStage === "published" || record.status === "published") &&
    (record.visibility === "public" || record.visibility === "registered");
  const evaluationAvailable =
    record.lifecycleStage === "published" ||
    record.lifecycleStage === "evaluating" ||
    record.lifecycleStage === "decided" ||
    record.status === "published";

  return (
    <>
      {governed ? (
        <Link
          className="challenge-button challenge-button--secondary"
          href={challengeHref(`/app/org/challenges/${record.id}/governance`)}
        >
          دروازه‌های انتشار
        </Link>
      ) : null}
      {publiclyListed ? (
        <>
          <Link
            className="challenge-button challenge-button--secondary"
            href={challengeHref(`/app/org/challenges/${record.id}/rubric`)}
          >
            معیارهای ارزیابی
          </Link>
          <Link
            className="challenge-button challenge-button--secondary"
            href={challengeHref(`/app/org/challenges/${record.id}/evaluation`)}
          >
            پرونده ارزیابی
          </Link>
          <Link
            className="challenge-button challenge-button--secondary"
            href={`/challenges/record/?id=${encodeURIComponent(record.id)}`}
          >
            نمای عمومی فراخوان
          </Link>
        </>
      ) : null}
      {evaluationAvailable && !publiclyListed ? (
        <Link
          className="challenge-button challenge-button--secondary"
          href={challengeHref(`/app/org/challenges/${record.id}/evaluation`)}
        >
          پرونده ارزیابی
        </Link>
      ) : null}
    </>
  );
}
