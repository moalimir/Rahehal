"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChallengeRecord } from "@/domain/challenge";
import {
  formatDateTime,
  getChallenge,
  listChallenges,
  saveChallenge,
} from "@/lib/challenges/storage";
import { normalizedEditableRecord } from "@/lib/challenges/validation";

export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

export function useChallengeList() {
  const [records, setRecords] = useState<ChallengeRecord[]>([]);
  const refresh = useCallback(() => setRecords(listChallenges()), []);
  useEffect(() => {
    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener("rahhal:challenges", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("rahhal:challenges", refresh);
    };
  }, [refresh]);
  return { records, refresh };
}

export function useChallengeRecord(id: string) {
  const [record, setRecord] = useState<ChallengeRecord | null | undefined>(undefined);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const recordRef = useRef<ChallengeRecord | null>(null);
  const statusRef = useRef<SaveStatus>("idle");
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const stored = getChallenge(id) ?? null;
    recordRef.current = stored;
    setRecord(stored);
    setSaveStatus(stored ? "saved" : "idle");
    statusRef.current = stored ? "saved" : "idle";
  }, [id]);

  const saveNow = useCallback(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    if (!recordRef.current) return null;
    setSaveStatus("saving");
    statusRef.current = "saving";
    try {
      const saved = saveChallenge(normalizedEditableRecord(recordRef.current));
      recordRef.current = saved;
      setRecord(saved);
      setSaveStatus("saved");
      statusRef.current = "saved";
      return saved;
    } catch {
      setSaveStatus("error");
      statusRef.current = "error";
      return null;
    }
  }, []);

  const updateRecord = useCallback(
    (updater: (current: ChallengeRecord) => ChallengeRecord) => {
      setRecord((current) => {
        if (!current) return current;
        const next = updater(current);
        recordRef.current = next;
        return next;
      });
      setSaveStatus("dirty");
      statusRef.current = "dirty";
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(saveNow, 650);
    },
    [saveNow],
  );

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!["dirty", "saving"].includes(statusRef.current)) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  useEffect(
    () => () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      if (recordRef.current && statusRef.current === "dirty") {
        saveChallenge(normalizedEditableRecord(recordRef.current));
      }
    },
    [],
  );

  return {
    record,
    setRecord,
    updateRecord,
    saveNow,
    saveStatus,
    lastSavedLabel: record ? formatDateTime(record.updatedAt) : "—",
  };
}
