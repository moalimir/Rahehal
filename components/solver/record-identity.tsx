"use client";

import { useRef, useState } from "react";

import { Icon } from "@/components/icons";

/**
 * How a record names itself across both workspaces.
 *
 * Connected records carry two kinds of identifier and they are not
 * interchangeable. A tracking code (`PRP-2026-000003`) is issued for a human
 * to quote; an opaque server id (`prp_a2b0952f…`) is a routing key that means
 * nothing to anyone and cannot be read aloud, remembered, or usefully
 * compared. Cards used to lead with whichever was present, so a proposal
 * whose tracking code had not been issued yet was titled with 32 hex
 * characters and the challenge title was pushed underneath it.
 *
 * The rule here: the human-meaningful line always leads. A tracking code sits
 * above the title as the reference it is; an opaque id is demoted to a
 * copyable chip beside the metadata, where it stays available for support and
 * debugging without pretending to be a name.
 *
 * Every identifier is wrapped in `<bdi dir="ltr">` because these are Latin
 * strings inside right-to-left Persian text, and an unisolated `prp_a2b…`
 * reorders around neighbouring punctuation.
 */
export function RecordReference({ code }: { code: string | null | undefined }) {
  if (!code) return null;
  return (
    <small className="rh-record-reference">
      <bdi dir="ltr">{code}</bdi>
    </small>
  );
}

/**
 * A copyable opaque identifier.
 *
 * It is a real control rather than decoration: the one thing a person does
 * with a server id is quote it in a support request, and selecting 32
 * characters of a right-to-left line by hand is the kind of small failure
 * that makes people screenshot the page instead.
 */
export function RecordId({ value, label = "شناسه رکورد" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const text = useRef<HTMLElement>(null);

  /**
   * Selects the identifier so the click still achieves something.
   *
   * The clipboard API refuses on insecure origins, in embedded views, and
   * whenever the document is not focused. Those are ordinary conditions rather
   * than errors, and a chip that silently does nothing when pressed is worse
   * than one that hands the person a selection they can copy themselves.
   */
  const selectValue = () => {
    const node = text.current;
    const selection = window.getSelection();
    if (!node || !selection) return;
    const range = document.createRange();
    range.selectNodeContents(node);
    selection.removeAllRanges();
    selection.addRange(range);
  };

  return (
    <button
      type="button"
      className={copied ? "rh-record-id is-copied" : "rh-record-id"}
      // The label names what is being copied; the visible text is the opaque
      // value itself, which a screen reader would otherwise read letter by
      // letter with no indication of what it belongs to.
      aria-label={`${label}: ${value}`}
      title={copied ? "نسخه‌برداری شد" : "نسخه‌برداری شناسه"}
      onClick={() => {
        const clipboard = navigator.clipboard;
        if (!clipboard) {
          selectValue();
          return;
        }
        void clipboard
          .writeText(value)
          .then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1_500);
          })
          .catch(selectValue);
      }}
    >
      <Icon name={copied ? "check" : "brief"} />
      <bdi dir="ltr" ref={text}>
        {value}
      </bdi>
    </button>
  );
}
