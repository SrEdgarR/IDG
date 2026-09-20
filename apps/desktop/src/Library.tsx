import { useEffect, useRef, useState } from "react";
import type {
  BulkAction,
  BulkItem,
} from "../../../packages/shared-types/protocol";
import type { Filters, DownloadView } from "./model";
import { formatBytes } from "./model";
import { execute } from "./desktop";
import { organize, useOrganization } from "./Organization";
import { Modal } from "./ui/Modal";

export function DeleteFileDialog({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const [preview, setPreview] = useState<{
      path: string;
      sha256: string;
      bytes: string;
    } | null>(null),
    [error, setError] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const request = useRef(crypto.randomUUID()),
    sending = useRef(false);
  useEffect(() => {
    let disposed = false;
    void execute({
      library: { operation: { action: "preview_delete", job_id: id } },
    })
      .then((r) => {
        if (!disposed && r.kind === "file_deletion_preview") setPreview(r);
      })
      .catch((e) => {
        if (!disposed) setError(String(e));
      });
    return () => {
      disposed = true;
    };
  }, [id]);
  async function remove() {
    if (!preview || !confirmed || sending.current) return;
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      const r = await execute(
        {
          library: {
            operation: {
              action: "delete_file",
              job_id: id,
              path: preview.path,
              sha256: preview.sha256,
            },
          },
        },
        request.current,
      );
      if (r.kind !== "bulk_results")
        throw Error("Sin confirmación del archivo.");
      setMessage(r.items[0].message);
      if (r.items[0].outcome === "accepted") setPreview(null);
    } catch (e) {
      setError(
        `${String(e)} Si la respuesta se interrumpió, reintentar consulta el mismo recibo; no repite la eliminación.`,
      );
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Eliminar archivo del disco"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <p>
        Esta acción elimina permanentemente el archivo enumerado. No usa la
        papelera y no permite deshacer. El registro del historial se conserva.
        Solo se admite un trabajo completado; se verifican tamaño y SHA-256
        antes de eliminar.
      </p>
      {preview && (
        <>
          <ol>
            <li>
              {preview.path} · {formatBytes(BigInt(preview.bytes))}
            </li>
          </ol>
          <label>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />{" "}
            Confirmo eliminar este archivo sin posibilidad de deshacer
          </label>
          <button
            className="danger"
            disabled={busy || !confirmed}
            onClick={() => void remove()}
          >
            Eliminar definitivamente el archivo enumerado
          </button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <button disabled={busy} onClick={onClose}>
        Cerrar
      </button>
    </Modal>
  );
}

export function useLibrarySearch(
  enabled: boolean,
  filters: Filters,
  page: number,
  rows: DownloadView[],
) {
  const [result, setResult] = useState({ ids: [] as string[], total: 0 }),
    [error, setError] = useState(""),
    [pending, setPending] = useState(false);
  const key = JSON.stringify({ ...filters, offset: page * 50 });
  const revision = rows
    .map((r) => `${r.id}:${r.state}:${r.category}`)
    .join("|");
  useEffect(() => {
    if (!enabled) return;
    let disposed = false,
      busy = false;
    async function load(showPending = false) {
      if (busy) return;
      busy = true;
      if (showPending) setPending(true);
      try {
        const r = await execute({
          library: {
            operation: {
              action: "search",
              query: {
                text: filters.query,
                view: filters.view,
                site: filters.site,
                after: filters.after,
                size: filters.size,
                status: filters.status,
                offset: page * 50,
              },
            },
          },
        });
        if (!disposed && r.kind === "search_results") {
          setResult({ ids: r.ids, total: r.total });
          setError("");
        }
      } catch (e) {
        if (!disposed) setError(String(e));
      } finally {
        busy = false;
        if (!disposed) setPending(false);
      }
    }
    const first = setTimeout(() => void load(true), 150),
      timer = setInterval(() => void load(), 2000);
    const changed = () => void load();
    addEventListener("idg-library-changed", changed);
    return () => {
      disposed = true;
      clearTimeout(first);
      clearInterval(timer);
      removeEventListener("idg-library-changed", changed);
    };
  }, [enabled, key, revision]);
  return { ...result, error, pending };
}
export function BulkControls({
  ids,
  rows,
}: {
  ids: string[];
  rows: DownloadView[];
}) {
  const { state } = useOrganization();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [results, setResults] = useState<BulkItem[]>([]),
    [queue, setQueue] = useState("main"),
    [category, setCategory] = useState("Otros");
  const sending = useRef(false),
    intent = useRef<{ key: string; id: string } | null>(null);
  async function run(operation: BulkAction, explicitIds = ids) {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError("");
    const key = JSON.stringify([explicitIds, operation]);
    if (intent.current?.key !== key)
      intent.current = { key, id: crypto.randomUUID() };
    try {
      const r = await execute(
        {
          library: {
            operation: { action: "bulk", ids: explicitIds, operation },
          },
        },
        intent.current.id,
      );
      if (r.kind !== "bulk_results") throw Error("Sin confirmación del lote.");
      setResults(r.items);
      intent.current = null;
      dispatchEvent(new Event("idg-library-changed"));
    } catch (e) {
      setError(String(e));
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  const counts = (kind: string) =>
    results.filter((r) => r.outcome === kind).length;
  return (
    <div aria-label="Operaciones masivas">
      <button
        disabled={busy || ids.length > 1000}
        onClick={() => void run({ kind: "pause" })}
      >
        Pausar compatibles
      </button>
      <button
        disabled={busy || ids.length > 1000}
        onClick={() => void run({ kind: "resume" })}
      >
        Reanudar compatibles
      </button>
      <button
        disabled={busy || ids.length > 1000}
        onClick={() => void run({ kind: "cancel" })}
      >
        Cancelar compatibles
      </button>
      <details>
        <summary>Organizar selección</summary>
        <label className="field">
          Cola de la selección
          <select value={queue} onChange={(e) => setQueue(e.target.value)}>
            {state?.queues.map((q) => (
              <option key={q.id} value={q.id}>
                {q.name}
              </option>
            ))}
          </select>
        </label>
        <button
          disabled={busy || ids.length > 1000}
          onClick={() => void run({ kind: "move_queue", queue_id: queue })}
        >
          Mover a cola
        </button>
        <label className="field">
          Categoría de la selección
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {state?.categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <button
          disabled={busy || ids.length > 1000}
          onClick={() => void run({ kind: "set_category", category })}
        >
          Cambiar categoría
        </button>
        <button
          disabled={busy || ids.length > 1000}
          onClick={() => void run({ kind: "set_priority", priority: "high" })}
        >
          Prioridad alta
        </button>
        <button
          disabled={busy || ids.length > 1000}
          onClick={() => void run({ kind: "set_priority", priority: "normal" })}
        >
          Prioridad normal
        </button>
        <button
          disabled={busy || ids.length > 1000}
          onClick={() => void run({ kind: "set_priority", priority: "low" })}
        >
          Prioridad baja
        </button>
        <p>
          Quitar del historial oculta trabajos terminados y conserva archivos y
          datos de recuperación. Puede deshacerse desde Ocultas.
        </p>
        <button
          disabled={busy || ids.length > 1000}
          onClick={() => void run({ kind: "hide" })}
        >
          Quitar del historial
        </button>
        <button
          disabled={busy || ids.length > 1000}
          onClick={() => void run({ kind: "restore" })}
        >
          Restaurar al historial
        </button>
      </details>
      {ids.length > 1000 && (
        <p role="alert">
          Máximo 1000 trabajos por operación. Reduce la selección.
        </p>
      )}
      {error && (
        <p role="alert">
          {error} Reintentar la misma acción conserva su identificador.
        </p>
      )}
      {results.length > 0 && (
        <section role="status">
          <p>
            {counts("accepted")} aceptados · {counts("skipped")} omitidos ·{" "}
            {counts("failed")} fallidos · {counts("unconfirmed")} sin
            confirmación.
          </p>
          <details>
            <summary>Resultados por trabajo</summary>
            <ul>
              {results.map((r) => (
                <li key={r.id}>
                  {rows.find((j) => j.id === r.id)?.name ?? r.id}: {r.message}
                </li>
              ))}
            </ul>
          </details>
        </section>
      )}
    </div>
  );
}
export function LibraryPreferences() {
  const { state, error, accept } = useOrganization();
  const [failure, setFailure] = useState("");
  const [saving, setSaving] = useState(false);
  const sending = useRef(false);
  if (!state) return <p role="status">Leyendo organización… {error}</p>;
  const save = (change: Partial<typeof state.library>) => {
    if (sending.current) return;
    sending.current = true;
    setSaving(true);
    setFailure("");
    void organize({
      action: "set_library_settings",
      settings: { ...state.library, ...change },
    })
      .then(accept)
      .catch((e) => setFailure(String(e)))
      .finally(() => {
        sending.current = false;
        setSaving(false);
      });
  };
  return (
    <section aria-label="Historial y estadísticas" aria-busy={saving}>
      {saving && <p role="status">Guardando en el motor…</p>}
      <p>
        Historial permanente por defecto. La retención opcional oculta trabajos
        terminados; no elimina archivos. Puedes restaurarlos desde Ocultas.
      </p>
      <label className="field">
        Retención del historial
        <select
          disabled={saving}
          value={state.library.retention_days ?? ""}
          onChange={(e) =>
            save({
              retention_days: e.target.value ? Number(e.target.value) : null,
            })
          }
        >
          <option value="">Permanente</option>
          <option value="7">7 días</option>
          <option value="30">30 días</option>
          <option value="90">90 días</option>
          <option value="365">365 días</option>
        </select>
      </label>
      <label>
        <input
          type="checkbox"
          checked={state.library.statistics}
          disabled={saving}
          onChange={(e) => save({ statistics: e.target.checked })}
        />{" "}
        Recopilar estadísticas locales
      </label>
      <label>
        <input
          type="checkbox"
          checked={state.library.clipboard}
          disabled={saving}
          onChange={(e) => save({ clipboard: e.target.checked })}
        />{" "}
        Monitorizar enlaces nuevos del portapapeles
      </label>
      <p>
        Apagado por defecto. Al activarlo observa cambios futuros; propone hasta
        32 enlaces durante cinco minutos, sin descargarlos. Al desactivarlo deja
        de observar y descarta propuestas. No guarda contenido en la base de
        datos ni lo envía a servidores.
      </p>
      <p>
        Cuenta una vez los archivos completados mientras esté activado y sus
        bytes verificados. Excluye trabajos marcados privados; no transmite
        datos. Desactivar detiene la recopilación, borrar reinicia los
        contadores.
      </p>
      <p>
        {state.statistics.completed} archivos ·{" "}
        {formatBytes(BigInt(state.statistics.bytes))}
      </p>
      <p>
        Media del ciclo completo:{" "}
        {BigInt(state.statistics.cycle_seconds) > 0n
          ? `${formatBytes(BigInt(state.statistics.timed_bytes) / BigInt(state.statistics.cycle_seconds))}/s`
          : "Sin intervalo medible"}
        . Bytes verificados divididos por la suma de segundos desde cada alta
        hasta observar su finalización; incluye cola, pausas y verificación.
        Resolución de un segundo; intervalos nulos o negativos no se usan. No es
        velocidad instantánea ni un benchmark de red.
      </p>
      <p>
        Sitios registrados más frecuentes (hasta 32 dominios; los siguientes se
        agrupan en Otros):
      </p>
      <ul>
        {state.statistics.sites.map((site) => (
          <li key={site.domain}>
            {site.domain}: {site.completed} archivos
          </li>
        ))}
      </ul>
      {state.statistics.other_sites_completed > 0 && (
        <p>Otros sitios: {state.statistics.other_sites_completed} archivos</p>
      )}
      <button
        onClick={() =>
          void organize({ action: "clear_statistics" }).catch((e) =>
            setFailure(String(e)),
          )
        }
      >
        Borrar estadísticas locales
      </button>
      {failure && <p role="alert">{failure}</p>}
    </section>
  );
}
