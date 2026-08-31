"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChallengeRecord } from "@/domain/challenge";
import type { ChallengeResult, ChallengeResultMeta } from "@/lib/challenges/gateway";
import { formatDateTime } from "@/lib/challenges/model";
import { useChallengeGateway } from "@/components/runtime-provider";
import { normalizedEditableRecord } from "@/lib/challenges/validation";

export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

export function useChallengeList() {
  const challengeGateway = useChallengeGateway();
  const [records, setRecords] = useState<ChallengeRecord[]>([]);
  const [loadError, setLoadError] = useState("");
  const mountedRef = useRef(false);
  const requestGenerationRef = useRef(0);
  const refresh = useCallback(async () => {
    const generation = ++requestGenerationRef.current;
    const result = await challengeGateway.queries.list();
    if (mountedRef.current && generation === requestGenerationRef.current) {
      if (result.ok) {
        setRecords(result.data);
        setLoadError("");
      } else {
        setLoadError(result.error.message);
      }
    }
    return result.ok;
  }, [challengeGateway]);

  useEffect(() => {
    mountedRef.current = true;
    const sync = () => void refresh();
    void refresh();
    window.addEventListener("storage", sync);
    window.addEventListener("rahhal:challenges", sync);
    return () => {
      mountedRef.current = false;
      requestGenerationRef.current += 1;
      window.removeEventListener("storage", sync);
      window.removeEventListener("rahhal:challenges", sync);
    };
  }, [refresh]);
  return { records, refresh, loadError };
}

export function useChallengeRecord(id: string) {
  const challengeGateway = useChallengeGateway();
  const [record, setRecord] = useState<ChallengeRecord | null | undefined>(undefined);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState<
    Extract<ChallengeResult<never>, { ok: false }>["error"] | null
  >(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [resourceMeta, setResourceMeta] = useState<ChallengeResultMeta | null>(null);
  const recordRef = useRef<ChallengeRecord | null>(null);
  const statusRef = useRef<SaveStatus>("idle");
  const timerRef = useRef<number | null>(null);
  const mountedRef = useRef(false);
  const activeIdRef = useRef(id);
  const loadGenerationRef = useRef(0);
  const saveGenerationRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    activeIdRef.current = id;
    setLoadedId(null);
    saveGenerationRef.current += 1;
    const loadGeneration = ++loadGenerationRef.current;
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    recordRef.current = null;
    statusRef.current = "idle";
    setRecord(undefined);
    setLoadError("");
    setSaveError(null);
    setSaveStatus("idle");
    setResourceMeta(null);
    void challengeGateway.queries.get(id).then((result) => {
      if (!active || activeIdRef.current !== id || loadGeneration !== loadGenerationRef.current)
        return;
      const stored = result.ok ? result.data : null;
      setResourceMeta(result.ok ? result.meta : null);
      setLoadError(!result.ok && result.error.code !== "NOT_FOUND" ? result.error.message : "");
      recordRef.current = stored;
      setLoadedId(id);
      setRecord(stored);
      setSaveStatus(stored ? "saved" : "idle");
      statusRef.current = stored ? "saved" : "idle";
    });
    return () => {
      active = false;
      loadGenerationRef.current += 1;
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (recordRef.current?.id === id && ["dirty", "error"].includes(statusRef.current)) {
        saveGenerationRef.current += 1;
        void challengeGateway.commands.save(normalizedEditableRecord(recordRef.current));
      }
    };
  }, [challengeGateway, id]);

  const saveNow = useCallback(async () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!recordRef.current) return null;
    const current = recordRef.current;
    if (current.id !== activeIdRef.current) return null;
    const currentId = current.id;
    const saveGeneration = ++saveGenerationRef.current;
    if (mountedRef.current) setSaveStatus("saving");
    statusRef.current = "saving";
    const result = await challengeGateway.commands.save(normalizedEditableRecord(current));
    if (
      !mountedRef.current ||
      activeIdRef.current !== currentId ||
      saveGeneration !== saveGenerationRef.current
    )
      return null;
    const snapshotUnchanged = recordRef.current === current;
    if (!result.ok) {
      setSaveError(result.error);
      const nextStatus = snapshotUnchanged ? "error" : "dirty";
      setSaveStatus(nextStatus);
      statusRef.current = nextStatus;
      return null;
    }
    if (snapshotUnchanged) {
      setSaveError(null);
      setResourceMeta(result.meta);
      recordRef.current = result.data;
      setRecord(result.data);
      setSaveStatus("saved");
      statusRef.current = "saved";
    } else {
      setSaveStatus("dirty");
      statusRef.current = "dirty";
      return null;
    }
    return result.data;
  }, [challengeGateway]);

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
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => void saveNow(), 650);
    },
    [saveNow],
  );

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!["dirty", "saving", "error"].includes(statusRef.current)) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const visibleRecord = loadedId === id ? record : undefined;

  return {
    record: visibleRecord,
    updateRecord,
    saveNow,
    saveStatus,
    lastSavedLabel: visibleRecord ? formatDateTime(visibleRecord.updatedAt) : "—",
    loadError: loadedId === id ? loadError : "",
    saveError,
    readiness: resourceMeta?.readiness ?? null,
    triageReadiness: resourceMeta?.triage_readiness ?? null,
    stage: resourceMeta?.stage ?? null,
  };
}
