import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  Command,
  ConnectionState,
  DownloadSnapshot,
  NewDownload,
  Payload,
  TransferOptions,
  StartPolicy,
  AppPreferences,
} from "../../../packages/shared-types/protocol";
import type { DownloadView } from "./model";

export class DownloadFailure extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export async function execute(
  command: Command,
  id: string = crypto.randomUUID(),
): Promise<Payload> {
  const result = await invoke<Payload>("download_command", {
    request: { version: 1, id, command },
  });
  if (result.kind === "download_failure")
    throw new DownloadFailure(result.code, result.message);
  if (result.kind === "error")
    throw new Error("Acción no disponible para esta conexión.");
  return result;
}
export const desktop = {
  defaultFolder: () => invoke<string>("default_download_directory"),
  recoverable: async (input: NewDownload) => {
    const result = await execute({ find_recoverable_download: { input } });
    return result.kind === "recoverable_download" ? result.job_id : null;
  },
  reveal: (jobId: string) => invoke<void>("reveal_download", { jobId }),
  chooseFolder: () => invoke<string | null>("choose_download_folder"),
  add: (
    id: string,
    input: NewDownload,
    options: TransferOptions,
    category: string,
    start: StartPolicy,
    queueId = "main",
  ) =>
    execute(
      { create_download: { draft: { input, options, category, start,queue_id:queueId } } },
      id,
    ),
  preferences: async (): Promise<AppPreferences> => {
    const result = await execute("get_app_preferences");
    if (result.kind !== "app_preferences")
      throw Error("No se pudieron leer las preferencias.");
    return result.preferences;
  },
  savePreferences: async (preferences: AppPreferences) => {
    const result = await execute({ set_app_preferences: { preferences } });
    if (result.kind !== "app_preferences")
      throw Error("No se guardaron las preferencias.");
    return result.preferences;
  },
  action: async (id: string, action: "pause" | "resume" | "cancel") => {
    return execute(
      action === "pause"
        ? { pause_download: { job_id: id } }
        : action === "cancel"
          ? { cancel_download: { job_id: id } }
          : { resume_download: { job_id: id } },
    );
  },
};
export type DesktopApi = typeof desktop;

export function usePreferences(backend?: DesktopApi) {
  const [preferences, setPreferences] = useState<AppPreferences | null>(null);
  const [failure, setFailure] = useState("");
  const pending = useRef(Promise.resolve());
  useEffect(() => {
    if (!backend) return;
    let disposed = false,
      last = "";
    let off: (() => void) | undefined;
    const load = () =>
      backend
        .preferences()
        .then((p) => {
          if (!disposed) setPreferences(p);
        })
        .catch(() => {});
    void listen<ConnectionState>("runtime-state", ({ payload }) => {
      if (!payload.connected) {
        last = "";
        return;
      }
      if (payload.snapshot && payload.snapshot.runtime_id !== last) {
        last = payload.snapshot.runtime_id;
        void load();
      }
    }).then((fn) => {
      if (disposed) fn();
      else off = fn;
    });
    void load();
    return () => {
      disposed = true;
      off?.();
    };
  }, [backend]);
  const save = (change: Partial<AppPreferences>) => {
    const next = pending.current.then(async () => {
      if (!backend) throw Error("Motor no disponible");
      const current = await backend.preferences();
      const saved = await backend.savePreferences({ ...current, ...change });
      setPreferences(saved);
      setFailure("");
    });
    pending.current = next.catch((e) => {
      setFailure(e instanceof Error ? e.message : String(e));
    });
    return next;
  };
  return { preferences, save, failure };
}

export function useDownloads(mini = false) {
  const [online, setOnline] = useState(false);
  const [rows, setRows] = useState<DownloadView[]>([]);
  const [error, setError] = useState("");
  const jobs = useRef(new Map<string, DownloadSnapshot>());
  const measurements = useRef(
    new Map<
      string,
      { at: number; bytes: bigint; speed: number | null; samples: number[] }
    >(),
  );
  useEffect(() => {
    let stopped = false,
      connected = false,
      refreshing = false,
      refreshAgain = false;
    let runtime = "",
      sequence: number | null = null;
    const duringRefresh = new Map<string, DownloadSnapshot>();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const releases: (() => void)[] = [];
    function publish() {
      if (stopped) return;
      timer = undefined;
      if (document.visibilityState === "hidden") return;
      const now = performance.now();
      setRows(
        Array.from(jobs.current.values())
          .sort((a, b) => {
            const left = BigInt(a.created_at),
              right = BigInt(b.created_at);
            return left === right
              ? a.id.localeCompare(b.id)
              : left < right
                ? -1
                : 1;
          })
          .map((job) => {
            const bytes = BigInt(job.received_bytes);
            const previous = measurements.current.get(job.id);
            let speed = previous?.speed ?? null;
            let samples = previous?.samples ?? [];
            if (!connected || job.state !== "downloading") speed = null;
            else if (previous && now - previous.at >= 200) {
              const delta = bytes - previous.bytes;
              speed =
                delta >= 0n && delta <= BigInt(Number.MAX_SAFE_INTEGER)
                  ? (Number(delta) * 1000) / (now - previous.at)
                  : null;
              if (speed !== null && document.visibilityState === "visible")
                samples = [...samples, speed].slice(-60);
            }
            measurements.current.set(job.id, {
              at: now,
              bytes,
              speed,
              samples,
            });
            const state: DownloadView["state"] =
              job.state === "downloading"
                ? "Downloading"
                : job.state === "completed"
                  ? "Completed"
                  : job.state === "paused"
                    ? "Paused"
                    : job.state === "deferred"
                      ? "Deferred"
                      : job.state === "queued"
                        ? "Queued"
                        : job.state === "cancelled"
                          ? "Cancelled"
                          : job.state === "probing"
                            ? "Probing"
                            : job.state === "failed"
                              ? "Failed"
                              : "Processing";
            const remaining =
              job.total_bytes === null ? null : BigInt(job.total_bytes) - bytes;
            const seconds =
              speed &&
              remaining !== null &&
              remaining >= 0n &&
              remaining <= BigInt(Number.MAX_SAFE_INTEGER)
                ? Math.ceil(Number(remaining) / speed)
                : null;
            return {
              id: job.id,
              name: job.name,
              state,
              category: job.category,
              domain: job.domain,
              date: new Date(Number(job.created_at) * 1000)
                .toISOString()
                .slice(0, 10),
              total: job.total_bytes === null ? null : BigInt(job.total_bytes),
              received: bytes,
              speed,
              eta: seconds === null ? null : `≈ ${seconds} s`,
              samples,
              resume:
                job.resume_capability === "range_verified"
                  ? "Disponible en la comprobación actual"
                  : "Desconocida",
              error: job.message ?? undefined,
              snapshot: job,
            };
          }),
      );
    }
    function schedule() {
      if (!timer) timer = setTimeout(publish, 250);
    }
    async function refresh() {
      if (refreshing) {
        refreshAgain = true;
        return;
      }
      refreshing = true;
      try {
        do {
          refreshAgain = false;
          duringRefresh.clear();
          const currentRuntime = runtime;
          const all = new Map<string, DownloadSnapshot>();
          let unavailable = 0;
          let offset: number | null = 0;
          while (offset !== null && !stopped && connected) {
            const result: Payload = await execute({
              list_downloads: { offset },
            });
            if (result.kind !== "downloads")
              throw new Error("No se pudo recuperar el historial.");
            for (const job of result.jobs) all.set(job.id, job);
            unavailable += result.unavailable.length;
            offset = result.next_offset;
          }
          if (connected && runtime === currentRuntime && !stopped) {
            for (const [id, job] of duringRefresh) all.set(id, job);
            jobs.current = all;
            setError(
              unavailable
                ? `${unavailable} trabajos protegidos no pudieron recuperarse. No se han borrado; comprueba la cuenta de Windows y el almacenamiento.`
                : "",
            );
            schedule();
          }
        } while (refreshAgain && connected && !stopped);
      } catch (e) {
        if (!stopped)
          setError(
            e instanceof Error
              ? e.message
              : "No se pudo recuperar el historial.",
          );
      } finally {
        refreshing = false;
      }
    }
    void (async () => {
      const offJobs = await listen<
        Extract<Payload, { kind: "download_changed" }>
      >("download-changed", ({ payload }) => {
        if (stopped || !connected) return;
        if (sequence === null || payload.sequence !== sequence + 1)
          void refresh();
        sequence = payload.sequence;
        const previous = jobs.current.get(payload.job.id);
        if (
          !mini &&
          previous &&
          previous.state !== payload.job.state &&
          ["completed", "failed"].includes(payload.job.state)
        )
          dispatchEvent(
            new CustomEvent("idg-job-finished", { detail: payload.job }),
          );
        jobs.current.set(payload.job.id, payload.job);
        if (refreshing) duringRefresh.set(payload.job.id, payload.job);
        schedule();
      });
      if (stopped) {
        offJobs();
        return;
      }
      releases.push(offJobs);
      const offState = await listen<ConnectionState>(
        "runtime-state",
        ({ payload }) => {
          const wasConnected = connected;
          connected = payload.connected;
          setOnline(connected);
          if (connected && payload.snapshot) {
            const changed = runtime !== payload.snapshot.runtime_id;
            if (changed) {
              sequence = null;
              measurements.current.clear();
              duringRefresh.clear();
            }
            runtime = payload.snapshot.runtime_id;
            if (!wasConnected || changed) {
              setError("");
              void refresh();
            }
          } else publish();
        },
      );
      if (stopped) offState();
      else releases.push(offState);
      if (mini) {
        const result = await invoke<Payload>("read_runtime_state");
        if (result.kind === "snapshot") {
          connected = !result.snapshot.stopping;
          setOnline(connected);
          runtime = result.snapshot.runtime_id;
          void refresh();
        }
      } else {
        await invoke("start_runtime");
        await invoke("connect_runtime");
      }
    })().catch((e) => {
      if (!stopped)
        setError(
          typeof e === "string"
            ? e
            : "No se pudo iniciar el motor. Usa Iniciar motor para volver a intentarlo.",
        );
    });
    const visible = () => {
      if (document.visibilityState === "visible") {
        publish();
        if (connected) void refresh();
      }
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", visible);
      if (timer) clearTimeout(timer);
      releases.forEach((off) => off());
    };
  }, [mini]);
  return { rows, error, setError, online };
}
