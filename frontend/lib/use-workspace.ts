"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Workspace } from "./types";

export function useWorkspace() {
  const [data, setData] = useState<Workspace | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState("");
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(
    null,
  );
  const dataRef = useRef(data);
  dataRef.current = data;
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const busy = useRef(false);
  const notify = useCallback(
    (text: string, error = false) => setToast({ text, error }),
    [],
  );
  const refresh = useCallback(async () => {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    try {
      const response = await fetch("/api/state", {
        cache: "no-store",
        signal: abort.signal,
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Could not open the local workspace.");
      if (!abort.signal.aborted && mounted.current) {
        setData(body);
        setError("");
      }
    } catch (e) {
      if (!abort.signal.aborted && mounted.current)
        setError(e instanceof Error ? e.message : "Connection failed.");
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, [refresh]);
  useEffect(() => {
    if (data?.job?.status !== "running") return;
    // Schedule only after the previous state update, so requests never pile up.
    const timer = setTimeout(() => void refresh(), 1500);
    return () => clearTimeout(timer);
  }, [data, refresh]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    return () => window.removeEventListener("focus", focus);
  }, [refresh]);
  const mutate = useCallback(
    async (path: string, body: unknown = {}, message?: string) => {
      if (busy.current) throw new Error("Another action is still being saved.");
      busy.current = true;
      setPending(path);
      try {
        const response = await fetch(`/api/${path}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-FlipCheck-Token": dataRef.current?.csrf_token || "",
          },
          body: JSON.stringify(body),
        });
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error || "The action could not be completed.");
        await refresh();
        notify(message || result.message || "Saved to your workspace.");
      } catch (e) {
        notify(e instanceof Error ? e.message : "Action failed.", true);
        throw e;
      } finally {
        busy.current = false;
        setPending("");
      }
    },
    [notify, refresh],
  );
  return { data, error, pending, toast, notify, mutate, refresh };
}
