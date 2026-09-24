import { useEffect, useRef, useState } from "react";
import type { DesktopApi } from "./desktop";
import { execute } from "./desktop";
import type {
  TransferOptions,
  StartPolicy,
} from "../../../packages/shared-types/protocol";
import { useOrganization } from "./Organization";
import { Modal } from "./ui/Modal";
import {
  decodeImport,
  parseImport,
  importEntry,
  MAX_IMPORT_BYTES,
  type ImportEntry,
} from "./import-parser";
type Entry = ImportEntry & {
  id: string;
  selected: boolean;
  reviewed: boolean;
  duplicate: boolean;
  directory: string;
  queueId: string;
  category: string;
  options: TransferOptions;
  result: string;
};
const defaults: TransferOptions = {
  mode: "automatic",
  replay_safe: false,
  bytes_per_second: null,
  priority: "normal",
};
function safeOrigin(url: string) {
  try {
    return new URL(url).origin;
  } catch {
    return "URL no válida";
  }
}
export function ImportDialog({
  backend,
  onClose,
  initialText = "",
}: {
  backend: DesktopApi;
  onClose: () => void;
  initialText?: string;
}) {
  const { state } = useOrganization();
  const [text, setText] = useState(initialText),
    [csv, setCsv] = useState(false),
    [directory, setDirectory] = useState(""),
    [queueId, setQueueId] = useState("main"),
    [start, setStart] = useState<StartPolicy>("later"),
    [entries, setEntries] = useState<Entry[]>([]),
    [page, setPage] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const stopped = useRef(false),
    working = useRef(false),
    overrides = useRef<string[]>([]),
    unmounted = useRef(false);
  const directoryEdited = useRef(false);
  useEffect(() => {
    void backend
      .preferences()
      .then((p) => {
        if (!unmounted.current && !directoryEdited.current)
          setDirectory(p.directory);
      })
      .catch((e) => setError(String(e)));
    return () => {
      unmounted.current = true;
      stopped.current = true;
    };
  }, [backend]);
  function source(value: string, isCsv: boolean) {
    setText(value);
    setCsv(isCsv);
    setEntries([]);
    setPage(0);
    setError("");
  }
  async function file(input: File) {
    try {
      if (input.size > MAX_IMPORT_BYTES)
        throw Error("El archivo supera 1 MiB.");
      if (!/\.(txt|csv)$/i.test(input.name)) throw Error("Elige TXT o CSV.");
      source(
        decodeImport(new Uint8Array(await input.arrayBuffer())),
        /\.csv$/i.test(input.name),
      );
    } catch (e) {
      setError(String(e));
    }
  }
  function invalidate() {
    setEntries((old) =>
      old.map((e) => ({
        ...e,
        reviewed: false,
        error: importEntry(e.url, e.name).error,
      })),
    );
  }
  async function preview() {
    if (working.current) return;
    working.current = true;
    stopped.current = false;
    setBusy(true);
    setError("");
    try {
      const sourceRows = entries.length
        ? entries
        : parseImport(text, csv).map((e) => ({
            ...e,
            id: crypto.randomUUID(),
            selected: !e.error,
            reviewed: false,
            duplicate: false,
            directory,
            queueId,
            category: "Otros",
            options: { ...defaults },
            result: "",
          }));
      const reviewed: Entry[] = [];
      const seen = new Set<string>();
      for (const row of sourceRows) {
        if (stopped.current || unmounted.current) break;
        let next = { ...row, reviewed: false, result: "" };
        if (!row.error) {
          try {
            const input = {
              url: row.url,
              name: row.name,
              directory,
              conflict: "reject" as const,
              expected_sha256: null,
            };
            const rules = await execute({
              organization: {
                operation: {
                  action: "preview_rules",
                  input,
                  overrides: overrides.current,
                },
              },
            });
            if (rules.kind !== "rule_preview")
              throw Error("No se pudieron evaluar las reglas.");
            const effect = rules.preview.effect;
            const duplicates = await execute({
              library: {
                operation: { action: "duplicates", input, context: "" },
              },
            });
            if (duplicates.kind !== "duplicates")
              throw Error("No se pudieron revisar duplicados.");
            next = {
              ...next,
              reviewed: true,
              directory: effect.directory ?? directory,
              queueId: effect.queue_id ?? queueId,
              category: effect.category ?? "Otros",
              options: {
                ...defaults,
                bytes_per_second: effect.bytes_per_second,
                priority: effect.priority ?? "normal",
              },
              duplicate: duplicates.ids.length > 0 || seen.has(row.url),
            };
            seen.add(row.url);
          } catch (e) {
            next = { ...next, error: String(e), selected: false };
          }
        }
        reviewed.push(next);
        if (!unmounted.current)
          setEntries([...reviewed, ...sourceRows.slice(reviewed.length)]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      working.current = false;
      if (!unmounted.current) setBusy(false);
    }
  }
  async function create() {
    if (working.current) return;
    working.current = true;
    stopped.current = false;
    setBusy(true);
    setError("");
    try {
      for (const row of entries.filter(
        (e) =>
          e.selected &&
          e.reviewed &&
          !e.error &&
          !e.result.startsWith("Creado"),
      )) {
        if (stopped.current || unmounted.current) break;
        let result = "";
        try {
          await backend.add(
            row.id,
            {
              url: row.url,
              directory: row.directory,
              name: row.name,
              expected_sha256: null,
              conflict: "reject",
            },
            row.options,
            row.category,
            start,
            row.queueId,
            false,
            [],
          );
          result = "Creado y confirmado por el motor";
        } catch (e) {
          result = `No confirmado: ${String(e)}. Reintentar conserva el identificador.`;
        }
        if (!unmounted.current)
          setEntries((old) =>
            old.map((e) => (e.id === row.id ? { ...e, result } : e)),
          );
      }
    } finally {
      working.current = false;
      if (!unmounted.current) setBusy(false);
    }
  }
  const editable = (index: number, change: Partial<ImportEntry>) =>
    setEntries((old) =>
      old.map((row, i) =>
        i === index
          ? {
              ...row,
              ...importEntry(change.url ?? row.url, change.name ?? row.name),
              reviewed: false,
              result: "",
            }
          : row,
      ),
    );
  const valid = entries.filter((e) => !e.error).length,
    ready = entries.filter((e) => e.selected && e.reviewed && !e.error).length;
  return (
    <Modal
      title="Importar enlaces"
      onClose={() => {
        stopped.current = true;
        if (!busy) onClose();
      }}
      wide
    >
      <p>
        Máximo 1 MiB y 1000 enlaces. TXT: una URL por línea. CSV: URL y nombre
        opcional; admite cabecera url,nombre y celdas entre comillas. UTF-8 o
        UTF-16 con BOM. No se descarga al abrir un archivo.
      </p>
      <div
        className="drop-zone"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (busy) return;
          if (e.dataTransfer.files.length === 1)
            void file(e.dataTransfer.files[0]);
          else if (e.dataTransfer.files.length > 1)
            setError("Suelta un archivo TXT/CSV cada vez.");
          else source(e.dataTransfer.getData("text/plain"), false);
        }}
      >
        <label className="field">
          Varias URLs o contenido CSV
          <textarea
            disabled={busy}
            rows={4}
            maxLength={MAX_IMPORT_BYTES}
            value={text}
            onChange={(e) => source(e.target.value, csv)}
          />
        </label>
        <label>
          <input
            type="checkbox"
            disabled={busy}
            checked={csv}
            onChange={(e) => source(text, e.target.checked)}
          />{" "}
          Interpretar CSV
        </label>
        <label className="field">
          Abrir TXT o CSV
          <input
            disabled={busy}
            type="file"
            accept=".txt,.csv,text/plain,text/csv"
            onChange={(e) => {
              const chosen = e.target.files?.[0];
              if (chosen) void file(chosen);
              e.target.value = "";
            }}
          />
        </label>
        <p>Puedes soltar aquí el archivo o varias URLs.</p>
      </div>
      <div className="form-grid">
        <label className="field">
          Carpeta del lote
          <input
            disabled={busy}
            value={directory}
            onFocus={() => {
              directoryEdited.current = true;
            }}
            onChange={(e) => {
              directoryEdited.current = true;
              setDirectory(e.target.value);
              if (!overrides.current.includes("directory"))
                overrides.current.push("directory");
              invalidate();
            }}
          />
        </label>
        <label className="field">
          Cola del lote
          <select
            disabled={busy}
            value={queueId}
            onChange={(e) => {
              setQueueId(e.target.value);
              if (!overrides.current.includes("queue_id"))
                overrides.current.push("queue_id");
              invalidate();
            }}
          >
            {state?.queues.map((q) => (
              <option key={q.id} value={q.id}>
                {q.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button disabled={busy} onClick={() => void preview()}>
        Previsualizar lote
      </button>
      {error && <p role="alert">{error}</p>}
      {entries.some((e) => e.result) && (
        <p role="status">
          {entries.filter((e) => e.result.startsWith("Creado")).length} creados
          · {entries.filter((e) => e.result.startsWith("No confirmado")).length}{" "}
          sin confirmar ·{" "}
          {entries.filter((e) => e.selected && !e.result).length} seleccionados
          sin enviar.
        </p>
      )}
      {entries.length > 0 && (
        <>
          <p role="status">
            {valid} válidos · {entries.length - valid} inválidos ·{" "}
            {entries.filter((e) => e.duplicate).length} posibles duplicados. Los
            duplicados no se borran ni se fusionan; exclúyelos si no quieres
            descargar otra vez.
          </p>
          <ol start={page * 20 + 1}>
            {entries.slice(page * 20, page * 20 + 20).map((entry, index) => {
              const n = page * 20 + index;
              return (
                <li key={entry.id}>
                  <label>
                    <input
                      type="checkbox"
                      disabled={
                        busy ||
                        Boolean(entry.error) ||
                        entry.result.startsWith("Creado")
                      }
                      checked={entry.selected}
                      onChange={(e) =>
                        setEntries((old) =>
                          old.map((row) =>
                            row.id === entry.id
                              ? { ...row, selected: e.target.checked }
                              : row,
                          ),
                        )
                      }
                    />{" "}
                    Incluir entrada {n + 1}
                  </label>
                  <label className="field">
                    URL de entrada {n + 1}
                    <input
                      type="password"
                      disabled={busy || entry.result.startsWith("Creado")}
                      value={entry.url}
                      onChange={(e) => editable(n, { url: e.target.value })}
                    />
                  </label>
                  <p>
                    {safeOrigin(entry.url)} · La URL completa se oculta para
                    proteger posibles tokens.
                  </p>
                  <label className="field">
                    Nombre de entrada {n + 1}
                    <input
                      disabled={busy || entry.result.startsWith("Creado")}
                      value={entry.name}
                      onChange={(e) => editable(n, { name: e.target.value })}
                    />
                  </label>
                  <p>
                    {entry.error ||
                      `${entry.directory} · ${state?.queues.find((q) => q.id === entry.queueId)?.name ?? entry.queueId} · ${entry.category}`}
                    {entry.duplicate ? " · Posible duplicado" : ""}
                  </p>
                  <p>
                    {entry.result ||
                      (!entry.reviewed && !entry.error
                        ? "Pendiente de previsualizar"
                        : "")}
                  </p>
                </li>
              );
            })}
          </ol>
          {entries.length > 20 && (
            <div className="pagination">
              <button disabled={page === 0} onClick={() => setPage(page - 1)}>
                Anterior
              </button>
              <span>Página {page + 1}</span>
              <button
                disabled={(page + 1) * 20 >= entries.length}
                onClick={() => setPage(page + 1)}
              >
                Siguiente
              </button>
            </div>
          )}
        </>
      )}
      <label className="field">
        Al crear los trabajos
        <select
          disabled={busy || entries.some((e) => e.result)}
          value={start}
          onChange={(e) => setStart(e.target.value as StartPolicy)}
        >
          <option value="later">Descargar después</option>
          <option value="queue">Añadir a cola</option>
          <option value="now">Descargar ahora</option>
        </select>
      </label>
      <footer className="dialog-actions">
        <button
          disabled={!busy}
          onClick={() => {
            stopped.current = true;
          }}
        >
          Detener procesamiento del lote
        </button>
        <button
          disabled={
            busy || !ready || entries.some((e) => e.selected && !e.reviewed)
          }
          onClick={() => void create()}
        >
          Crear trabajos revisados ({ready})
        </button>
        <button disabled={busy} onClick={onClose}>
          Cerrar
        </button>
      </footer>
      <p>
        Detener evita enviar las siguientes entradas; los trabajos ya
        confirmados se conservan. Cancelarlos es una acción separada en la
        lista. Reintentar una entrada usa su mismo identificador.
      </p>
    </Modal>
  );
}
