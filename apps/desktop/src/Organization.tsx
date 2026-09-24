import { useEffect, useState, useRef } from "react";
import { execute } from "./desktop";
import { Modal } from "./ui/Modal";
import type {
  DownloadQueue,
  OrganizationCommand,
  OrganizationState,
  DownloadSnapshot,
} from "../../../packages/shared-types/protocol";

export async function organize(
  operation: OrganizationCommand,
  id = crypto.randomUUID(),
) {
  const result = await execute({ organization: { operation } }, id);
  if (result.kind !== "organization")
    throw Error("No se confirmó la organización.");
  dispatchEvent(new Event("idg-organization-changed"));
  return result.state;
}
export function useOrganization(enabled = true) {
  const [state, setState] = useState<OrganizationState | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    if (!enabled) return;
    let disposed = false,
      busy = false;
    const load = async () => {
      if (busy || document.visibilityState === "hidden") return;
      busy = true;
      try {
        const r = await execute({
          organization: { operation: { action: "get" } },
        });
        if (!disposed && r.kind === "organization") {
          setState(r.state);
          setError("");
        }
      } catch (e) {
        if (!disposed) setError(String(e));
      } finally {
        busy = false;
      }
    };
    void load();
    const timer = setInterval(() => void load(), 2000);
    addEventListener("idg-organization-changed", load);
    return () => {
      disposed = true;
      clearInterval(timer);
      removeEventListener("idg-organization-changed", load);
    };
  }, [enabled]);
  return { state, error, accept: setState };
}
const blankQueue = (): DownloadQueue => ({
  id: crypto.randomUUID(),
  name: "",
  running: false,
  concurrency: 3,
  priority: "normal",
  schedule: null,
  on_finish: "none",
  power_armed: false,
});
const scheduleTextOf = (schedule: DownloadQueue["schedule"]) =>
  schedule ? new Date(schedule.at * 1000).toISOString() : "";
const scheduleErrorText =
  "Indica una fecha ISO con zona explícita y segundos completos, por ejemplo 2026-09-24T12:00:00+02:00 o Z (UTC).";
function parseScheduleText(value: string): number | null {
  const text = value.trim();
  if (!text) return null;
  const parts =
    /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.0{1,3})?(Z|[+-]\d\d:\d\d)$/.exec(
      text,
    );
  const time = Date.parse(text);
  if (!parts || !Number.isFinite(time) || time < 0 || time / 1000 > 4294967295)
    throw Error(scheduleErrorText);
  const zone = parts[7];
  const offset =
    zone === "Z"
      ? 0
      : (zone[0] === "+" ? 1 : -1) *
        (Number(zone.slice(1, 3)) * 60 + Number(zone.slice(4, 6)));
  if (zone !== "Z" && (Number(zone.slice(1, 3)) > 23 || Number(zone.slice(4, 6)) > 59))
    throw Error(scheduleErrorText);
  const local = new Date(time + offset * 60_000);
  if (
    local.getUTCFullYear() !== Number(parts[1]) ||
    local.getUTCMonth() + 1 !== Number(parts[2]) ||
    local.getUTCDate() !== Number(parts[3]) ||
    local.getUTCHours() !== Number(parts[4]) ||
    local.getUTCMinutes() !== Number(parts[5]) ||
    local.getUTCSeconds() !== Number(parts[6])
  )
    throw Error(scheduleErrorText);
  return time / 1000;
}
/** Uses the existing gallery's modal, queue-item, form-grid and folded advanced structure. */
export function QueueEditor({ onClose }: { onClose: () => void }) {
  const { state, error, accept } = useOrganization();
  const [draft, setDraft] = useState<DownloadQueue>(blankQueue);
  const [scheduleText, setScheduleText] = useState("");
  const scheduleInput = useRef<HTMLInputElement>(null);
  const editRevision = useRef(0);
  const [jobs, setJobs] = useState<DownloadSnapshot[]>([]),
    [failure, setFailure] = useState(""),
    [busy, setBusy] = useState(false),
    [moveTo, setMoveTo] = useState("main"),
    [remove, setRemove] = useState(false);
  const sending = useRef(false);
  const [scheduleError, setScheduleError] = useState("");
  const [page, setPage] = useState(0);
  const patch = (change: Partial<DownloadQueue>) =>
    setDraft((current) => ({ ...current, ...change }));
  async function loadJobs() {
    let offset: number | null = 0;
    const all: DownloadSnapshot[] = [];
    while (offset !== null) {
      const r = await execute({ list_downloads: { offset } });
      if (r.kind !== "downloads") throw Error("Historial no disponible");
      all.push(...r.jobs);
      offset = r.next_offset;
    }
    setJobs(all);
  }
  useEffect(() => {
    void loadJobs().catch((e) => setFailure(String(e)));
  }, []);
  async function act(operation: OrganizationCommand, revision?: number) {
    if (sending.current) return false;
    sending.current = true;
    setBusy(true);
    setFailure("");
    try {
      const updated = await organize(operation);
      accept(updated);
      if (operation.action !== "move_jobs" && operation.action !== "reorder")
        setDraft(
          (current) =>
            revision !== undefined && revision !== editRevision.current
              ? current
              : (updated.queues.find((q) => q.id === current.id) ?? current),
        );
      await loadJobs();
      return true;
    } catch (e) {
      setFailure(String(e));
      return false;
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  const confirmedSchedule = state?.queues.find((q) => q.id === draft.id)?.schedule;
  let scheduleChanged = false;
  try {
    scheduleChanged = parseScheduleText(scheduleText) !== (confirmedSchedule?.at ?? null);
  } catch {
    scheduleChanged = true;
  }
  function saveQueue() {
    let at: number | null;
    try {
      at = parseScheduleText(scheduleInput.current?.value ?? scheduleText);
    } catch (e) {
      setScheduleError(e instanceof Error ? e.message : scheduleErrorText);
      return;
    }
    setScheduleError("");
    const schedule =
      at === null
        ? null
        : draft.schedule?.at === at
          ? draft.schedule
          : { at, state: "pending" as const };
    void act({ action: "save_queue", queue: { ...draft, schedule } }, editRevision.current);
  }
  const queueJobs = jobs
    .filter((j) => j.queue_id === draft.id)
    .sort(
      (a, b) =>
        a.queue_order - b.queue_order ||
        (BigInt(a.created_at) < BigInt(b.created_at)
          ? -1
          : BigInt(a.created_at) > BigInt(b.created_at)
            ? 1
            : a.id.localeCompare(b.id)),
    );
  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(queueJobs.length / 50) - 1),
  );
  return (
    <Modal
      title="Colas y programación"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      {(error || failure || scheduleError) && (
        <p role="alert">{scheduleError || failure || error}</p>
      )}
      <label className="field">
        Cola
        <select
          disabled={busy}
          value={
            state?.queues.some((q) => q.id === draft.id) ? draft.id : "new"
          }
          onChange={(e) => {
            setRemove(false);
            setPage(0);
            setScheduleError("");
            const selected =
              state?.queues.find((q) => q.id === e.target.value) ?? blankQueue();
            setDraft(selected);
            setScheduleText(scheduleTextOf(selected.schedule));
            editRevision.current++;
          }}
        >
          <option value="new">Nueva cola</option>
          {state?.queues.map((q) => (
            <option key={q.id} value={q.id}>
              {q.name} · {q.running ? "En ejecución" : "Detenida"}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Nombre de la cola
        <input
          value={draft.name}
          maxLength={120}
          onChange={(e) => patch({ name: e.target.value })}
        />
      </label>
      <div className="form-grid">
        <label className="field">
          Simultáneas
          <input
            type="number"
            min={1}
            max={32}
            value={draft.concurrency}
            onChange={(e) => patch({ concurrency: Number(e.target.value) })}
          />
        </label>
        <label className="field">
          Prioridad de cola
          <select
            value={draft.priority}
            onChange={(e) =>
              patch({ priority: e.target.value as DownloadQueue["priority"] })
            }
          >
            <option value="high">Alta</option>
            <option value="normal">Normal</option>
            <option value="low">Baja</option>
          </select>
        </label>
      </div>
      <details>
        <summary>Horario y opciones avanzadas</summary>
        <label className="field">
          Inicio único (fecha, hora y zona)
          <input
            ref={scheduleInput}
            placeholder="AAAA-MM-DDTHH:MM:SS+00:00"
            value={scheduleText}
            onChange={(e) => {
              setScheduleText(e.target.value);
              editRevision.current++;
              setScheduleError("");
            }}
          />
        </label>
        <p>
          La programación necesita el motor activo y Windows despierto. Se
          ejecuta una vez; recupera hasta 15 minutos de retraso y después vence
          sin iniciar.
        </p>
        {scheduleChanged && <p>Cambio de horario sin guardar.</p>}
        {confirmedSchedule && (
          <p>
            Programación guardada: {new Date(confirmedSchedule.at * 1000).toLocaleString()}{" "}
            (hora del equipo). Estado:{" "}
            {
              { pending: "Pendiente", applied: "Aplicado", missed: "Vencido" }[
                confirmedSchedule.state
              ]
            }
            .
          </p>
        )}
        <label className="field">
          Al terminar
          <select
            value={draft.on_finish}
            onChange={(e) =>
              patch({ on_finish: e.target.value as DownloadQueue["on_finish"] })
            }
          >
            <option value="none">Ninguna</option>
            <option value="shutdown">Apagar</option>
            <option value="suspend">Suspender</option>
            <option value="hibernate">Hibernar</option>
          </select>
        </label>
        <p>
          Guardar no activa la energía. La activación siguiente es para una sola
          vez, tras completar y verificar todos los trabajos de IDG. Habrá 60
          segundos para cancelar. Los errores, pausas y trabajos pendientes la
          bloquean.
        </p>
        <button
          disabled={
            busy ||
            draft.on_finish === "none" ||
            !state?.queues.some((q) => q.id === draft.id)
          }
          onClick={() =>
            void act({
              action: "arm_power",
              id: draft.id,
              power: draft.on_finish,
            })
          }
        >
          Confirmar y activar energía una vez
        </button>
        <p>
          {state?.power_simulated
            ? "Modo de prueba: no se enviarán acciones a Windows."
            : "Esta activación puede apagar, suspender o hibernar Windows."}{" "}
          {state?.queues.find((q) => q.id === draft.id)?.power_armed
            ? "Activada para una vez."
            : "Sin activación pendiente."}
        </p>
      </details>
      <ol start={currentPage * 50 + 1}>
        {queueJobs
          .slice(currentPage * 50, currentPage * 50 + 50)
          .map((j, i) => (
            <li className="queue-item" key={j.id}>
              {j.name} · {j.state}
              <button
                disabled={busy || (currentPage === 0 && i === 0)}
                aria-label={`Subir ${j.name}`}
                onClick={() => {
                  void act({ action: "move_up", job_id: j.id });
                }}
              >
                Subir
              </button>
              <button
                disabled={busy || moveTo === draft.id}
                onClick={() =>
                  void act({
                    action: "move_jobs",
                    ids: [j.id],
                    queue_id: moveTo,
                  })
                }
              >
                Mover
              </button>
            </li>
          ))}
      </ol>
      {queueJobs.length > 50 && (
        <nav aria-label="Páginas de la cola">
          <button
            disabled={busy || currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
          >
            Anteriores
          </button>
          <span>
            {" "}
            {currentPage + 1} de {Math.ceil(queueJobs.length / 50)} ·{" "}
            {queueJobs.length} trabajos{" "}
          </span>
          <button
            disabled={busy || (currentPage + 1) * 50 >= queueJobs.length}
            onClick={() => setPage(currentPage + 1)}
          >
            Siguientes
          </button>
        </nav>
      )}
      <label className="field">
        Cola de destino
        <select value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
          {state?.queues.map((q) => (
            <option key={q.id} value={q.id}>
              {q.name}
            </option>
          ))}
        </select>
      </label>
      <p>
        Detener impide nuevos inicios. Pausar activas es una acción distinta.
        Para mover u ordenar, pausa primero los trabajos activos.
      </p>
      {remove && (
        <div role="alert">
          <p>
            Eliminar esta cola reasigna todos sus trabajos a la cola de destino.
            No borra archivos ni cancela trabajos.
          </p>
          <button
            disabled={busy || moveTo === draft.id}
            onClick={() =>
              void act({
                action: "delete_queue",
                id: draft.id,
                reassign_to: moveTo,
              }).then((ok) => {
                if (ok) {
                  setRemove(false);
                  setDraft(blankQueue());
                  setScheduleText("");
                  setScheduleError("");
                  editRevision.current++;
                }
              })
            }
          >
            Confirmar reasignación y eliminar cola
          </button>
          <button onClick={() => setRemove(false)}>Conservar cola</button>
        </div>
      )}
      <footer className="dialog-actions">
        <button disabled={busy} onClick={onClose}>
          Cerrar
        </button>
        <button
          disabled={busy || !draft.name.trim()}
          onClick={saveQueue}
        >
          Guardar cola
        </button>
        <button
          disabled={busy || !state?.queues.some((q) => q.id === draft.id)}
          onClick={() =>
            void act({ action: "run_queue", id: draft.id, running: true })
          }
        >
          Iniciar cola
        </button>
        <button
          disabled={busy}
          onClick={() =>
            void act({ action: "run_queue", id: draft.id, running: false })
          }
        >
          Detener nuevos inicios
        </button>
        <button
          disabled={busy}
          onClick={() => void act({ action: "pause_queue", id: draft.id })}
        >
          Pausar activas
        </button>
        <button
          disabled={busy || draft.id === "main"}
          onClick={() => setRemove(true)}
        >
          Eliminar cola
        </button>
      </footer>
    </Modal>
  );
}

export function EnergyNotice() {
  const { state } = useOrganization();
  const [error, setError] = useState("");
  if (!state?.power_message) return null;
  return (
    <aside role="status" className="connection-banner">
      <span>
        {state.power_simulated ? "Simulación · " : ""}
        {state.power_message}
        {state.power_remaining !== null
          ? ` en ${state.power_remaining} segundos`
          : ""}
      </span>
      {state.power_remaining !== null && (
        <button
          onClick={() =>
            void organize({ action: "cancel_power" }).catch((e) =>
              setError(String(e)),
            )
          }
        >
          Cancelar acción de energía
        </button>
      )}
      {error && <span role="alert">{error}</span>}
    </aside>
  );
}
