"use client";

import { useEffect } from "react";

const focusableSelector =
  "button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])";

/** Accessibility bridge for legacy dialogs while they migrate to the shared primitive. */
export function DialogAccessibilityManager() {
  useEffect(() => {
    let activeDialog: HTMLElement | null = null;
    let returnFocus: HTMLElement | null = null;
    let previousOverflow = "";
    let inerted: HTMLElement[] = [];

    const setBackgroundInert = (dialog: HTMLElement) => {
      let node: HTMLElement | null = dialog;
      while (node?.parentElement) {
        for (const sibling of Array.from(node.parentElement.children)) {
          if (sibling !== node && sibling instanceof HTMLElement && !sibling.inert) {
            sibling.inert = true;
            inerted.push(sibling);
          }
        }
        node = node.parentElement;
        if (node === document.body) break;
      }
    };
    const clear = () => {
      inerted.forEach((element) => {
        element.inert = false;
      });
      inerted = [];
      document.body.style.overflow = previousOverflow;
      activeDialog = null;
      returnFocus?.focus();
      returnFocus = null;
    };
    const sync = () => {
      const next = document.querySelector<HTMLElement>(
        '[role="dialog"][aria-modal="true"]:not(.app-dialog)',
      );
      if (next === activeDialog) return;
      if (activeDialog) clear();
      if (!next) return;
      activeDialog = next;
      returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      setBackgroundInert(next);
      requestAnimationFrame(() => next.querySelector<HTMLElement>(focusableSelector)?.focus());
    };
    const onKey = (event: KeyboardEvent) => {
      if (!activeDialog) return;
      if (event.key === "Escape") {
        const close = Array.from(activeDialog.querySelectorAll<HTMLButtonElement>("button")).find(
          (button) =>
            /بستن|انصراف/.test(button.getAttribute("aria-label") ?? button.textContent ?? ""),
        );
        close?.click();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = Array.from(activeDialog.querySelectorAll<HTMLElement>(focusableSelector));
      const first = controls[0];
      const last = controls.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    document.addEventListener("keydown", onKey);
    sync();
    return () => {
      observer.disconnect();
      document.removeEventListener("keydown", onKey);
      if (activeDialog) clear();
    };
  }, []);
  return null;
}
