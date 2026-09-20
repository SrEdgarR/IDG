import {useEffect, useRef, useState} from "react";
import {invoke} from "@tauri-apps/api/core";
import {listen} from "@tauri-apps/api/event";
import type {Command, ConnectionState, DownloadSnapshot, NewDownload, Payload, TransferOptions} from "../../../packages/shared-types/protocol";
import type {DownloadView} from "./model";

export async function execute(command: Command, id: string = crypto.randomUUID()): Promise<Payload> {
  const result = await invoke<Payload>("download_command", {request: {version: 1, id, command}});
  if (result.kind === "download_failure") throw new Error(result.message);
  if (result.kind === "error") throw new Error("Acción no disponible para esta conexión.");
  return result;
}
export const desktop = {
  chooseFolder: () => invoke<string | null>("choose_download_folder"),
  add: (id: string, input: NewDownload, options: TransferOptions) => execute({add_download_with_options: {input, options}}, id),
};
export type DesktopApi = typeof desktop;

export function useDownloads() {
  const [rows, setRows] = useState<DownloadView[]>([]);
  const [error, setError] = useState("");
  const jobs = useRef(new Map<string, DownloadSnapshot>());
  const measurements = useRef(new Map<string, {at: number; bytes: bigint; speed: number | null; samples: number[]}>());
  useEffect(() => {
    let stopped = false, connected = false, refreshing = false, refreshAgain = false;
    let runtime = "", sequence: number | null = null;
    const duringRefresh = new Map<string, DownloadSnapshot>();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const releases: (() => void)[] = [];
    function publish() {
      if (stopped) return;
      timer = undefined;
      const now = performance.now();
      setRows(Array.from(jobs.current.values()).map(job => {
        const bytes = BigInt(job.received_bytes);
        const previous = measurements.current.get(job.id);
        let speed = previous?.speed ?? null;
        let samples = previous?.samples ?? [];
        if (!connected || job.state !== "downloading") speed = null;
        else if (previous && now - previous.at >= 200) {
          const delta = bytes - previous.bytes;
          speed = delta >= 0n && delta <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(delta) * 1000 / (now - previous.at) : null;
          if (speed !== null && document.visibilityState === "visible") samples = [...samples, speed].slice(-60);
        }
        measurements.current.set(job.id, {at: now, bytes, speed, samples});
        const state: DownloadView["state"] = job.state === "downloading" ? "Downloading" : job.state === "completed" ? "Completed" : job.state === "paused" ? "Paused" : job.state === "probing" ? "Probing" : job.state === "failed" || job.state === "cancelled" ? "Failed" : "Processing";
        return {id: job.id, name: job.name, state, category: "Otros", domain: "", date: "", total: job.total_bytes === null ? null : BigInt(job.total_bytes), received: bytes,
          speed, eta: null, samples, resume: job.resume_capability === "range_verified" ? "Disponible en la comprobación actual" : "Desconocida", error: job.message ?? undefined, snapshot: job};
      }));
    }
    function schedule() { if (!timer) timer = setTimeout(publish, 250); }
    async function refresh() {
      if (refreshing) { refreshAgain = true; return; }
      refreshing = true;
      try {
        do {
          refreshAgain = false;
          duringRefresh.clear();
          const currentRuntime = runtime;
          const all = new Map<string, DownloadSnapshot>();
          let offset: number | null = 0;
          while (offset !== null && !stopped && connected) {
            const result: Payload = await execute({list_downloads: {offset}});
            if (result.kind !== "downloads") throw new Error("No se pudo recuperar el historial.");
            for (const job of result.jobs) all.set(job.id, job);
            offset = result.next_offset;
          }
          if (connected && runtime === currentRuntime && !stopped) {
            for (const [id, job] of duringRefresh) all.set(id, job);
            jobs.current = all; schedule();
          }
        } while (refreshAgain && connected && !stopped);
      } catch (e) { if (!stopped) setError(e instanceof Error ? e.message : "No se pudo recuperar el historial."); }
      finally { refreshing = false; }
    }
    void (async () => {
      const offJobs = await listen<Extract<Payload, {kind: "download_changed"}>>("download-changed", ({payload}) => {
        if (stopped || !connected) return;
        if (sequence === null || payload.sequence !== sequence + 1) void refresh();
        sequence = payload.sequence;
        jobs.current.set(payload.job.id, payload.job);
        if (refreshing) duringRefresh.set(payload.job.id, payload.job);
        schedule();
      });
      if (stopped) { offJobs(); return; } releases.push(offJobs);
      const offState = await listen<ConnectionState>("runtime-state", ({payload}) => {
        const wasConnected = connected;
        connected = payload.connected;
        if (connected && payload.snapshot) {
          const changed = runtime !== payload.snapshot.runtime_id;
          if (changed) { sequence = null; measurements.current.clear(); duringRefresh.clear(); }
          runtime = payload.snapshot.runtime_id;
          if (!wasConnected || changed) { setError(""); void refresh(); }
        } else publish();
      });
      if (stopped) offState(); else releases.push(offState);
      await invoke("connect_runtime");
    })().catch(() => { if (!stopped) setError("Abre la aplicación IDG para conectar con el motor."); });
    return () => {stopped = true; if (timer) clearTimeout(timer); releases.forEach(off => off());};
  }, []);
  return {rows, error, setError};
}
