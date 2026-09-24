import { useRef, useState } from "react";
import type {
  OrganizationRule,
  RuleEffect,
  RulePreview,
  DownloadSnapshot,
} from "../../../packages/shared-types/protocol";
import { execute } from "./desktop";
import { organize, useOrganization } from "./Organization";
import { Modal } from "./ui/Modal";

const blank = (): OrganizationRule => ({
  id: crypto.randomUUID(),
  name: "",
  enabled: true,
  rank: 10,
  domain: "",
  extension: "",
  media_type: "",
  min_bytes: null,
  max_bytes: null,
  from_minute: null,
  until_minute: null,
  effect: {
    directory: null,
    category: null,
    queue_id: null,
    bytes_per_second: null,
    priority: null,
  },
});
export function RuleResult({ preview }: { preview: RulePreview }) {
  const names: Record<keyof RuleEffect, string> = {
    directory: "Carpeta",
    category: "Categoría",
    queue_id: "Cola (identificador)",
    bytes_per_second: "Límite en B/s",
    priority: "Prioridad",
  };
  return (
    <section aria-label="Resultado de reglas">
      <p>
        {preview.matched.length} reglas coincidentes. La primera por orden e
        identificador prevalece para cada campo.
      </p>
      <dl>
        {Object.entries(preview.effect)
          .filter(([, value]) => value !== null)
          .map(([key, value]) => (
            <div key={key}>
              <dt>{names[key as keyof RuleEffect]}</dt>
              <dd>{String(value)}</dd>
            </div>
          ))}
      </dl>
      <ul>
        {preview.explanations.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
    </section>
  );
}
export function RuleEditor({ onClose }: { onClose: () => void }) {
  const { state, error } = useOrganization();
  const [draft, setDraft] = useState(blank);
  const [failure, setFailure] = useState(""),
    [busy, setBusy] = useState(false),
    [category, setCategory] = useState("");
  const [preview, setPreview] = useState<RulePreview | null>(null),
    [jobs, setJobs] = useState<DownloadSnapshot[]>([]),
    [jobId, setJobId] = useState("");
  const sending = useRef(false);
  const patch = (change: Partial<OrganizationRule>) => {
    setDraft({ ...draft, ...change });
    setPreview(null);
  };
  const effect = (change: Partial<RuleEffect>) =>
    patch({ effect: { ...draft.effect, ...change } });
  async function act(work: () => Promise<unknown>) {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setFailure("");
    try {
      await work();
    } catch (e) {
      setFailure(e instanceof Error ? e.message : String(e));
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  async function loadJobs() {
    const all: DownloadSnapshot[] = [];
    let offset: number | null = 0;
    while (offset !== null) {
      const r = await execute({ list_downloads: { offset } });
      if (r.kind !== "downloads") throw Error("No se pudo leer el historial.");
      all.push(...r.jobs);
      offset = r.next_offset;
    }
    setJobs(all);
    setPreview(null);
  }
  async function previewJob() {
    const r = await execute({
      organization: {
        operation: { action: "preview_job_rules", job_id: jobId },
      },
    });
    if (r.kind !== "rule_preview") throw Error("Vista previa no disponible.");
    setPreview(r.preview);
  }
  return (
    <Modal
      title="Reglas de organización"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      {(failure || error) && <p role="alert">{failure || error}</p>}
      <p>
        Las reglas guardadas se aplican a trabajos nuevos. No hacen consultas de
        red y respetan las elecciones explícitas. Guardar nunca mueve archivos
        existentes.
      </p>
      <label className="field">
        Regla
        <select
          value={state?.rules.some((r) => r.id === draft.id) ? draft.id : "new"}
          onChange={(e) => {
            setDraft(
              state?.rules.find((r) => r.id === e.target.value) ?? blank(),
            );
            setPreview(null);
          }}
        >
          <option value="new">Nueva regla</option>
          {state?.rules.map((r) => (
            <option key={r.id} value={r.id}>
              {r.rank} · {r.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Nombre de la regla
        <input
          maxLength={120}
          value={draft.name}
          onChange={(e) => patch({ name: e.target.value })}
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={draft.enabled}
          onChange={(e) => patch({ enabled: e.target.checked })}
        />{" "}
        Activada
      </label>
      <div className="form-grid">
        <label className="field">
          Dominio exacto
          <input
            value={draft.domain}
            onChange={(e) => patch({ domain: e.target.value })}
            placeholder="example.org"
          />
        </label>
        <label className="field">
          Extensión sin punto
          <input
            value={draft.extension}
            onChange={(e) => patch({ extension: e.target.value })}
            placeholder="pdf"
          />
        </label>
      </div>
      <label className="field">
        Carpeta de destino
        <input
          value={draft.effect.directory ?? ""}
          onChange={(e) => effect({ directory: e.target.value || null })}
        />
      </label>
      <div className="form-grid">
        <label className="field">
          Categoría de destino
          <select
            value={draft.effect.category ?? ""}
            onChange={(e) => effect({ category: e.target.value || null })}
          >
            <option value="">Sin cambio</option>
            {state?.categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Cola de destino
          <select
            value={draft.effect.queue_id ?? ""}
            onChange={(e) => effect({ queue_id: e.target.value || null })}
          >
            <option value="">Sin cambio</option>
            {state?.queues.map((q) => (
              <option key={q.id} value={q.id}>
                {q.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <details>
        <summary>Condiciones y acciones avanzadas</summary>
        <p>
          Las condiciones se combinan con «y». En blanco no restringe. El tamaño
          y tipo HTTP son desconocidos antes de descargar; esas condiciones no
          coinciden hasta disponer de metadatos reales. Horario diario expresado
          en UTC, inicio incluido y fin excluido.
        </p>
        <label className="field">
          Orden (menor primero)
          <input
            type="number"
            min={0}
            max={4294967295}
            value={draft.rank}
            onChange={(e) => patch({ rank: Number(e.target.value) })}
          />
        </label>
        <label className="field">
          Tipo HTTP exacto
          <input
            value={draft.media_type}
            onChange={(e) => patch({ media_type: e.target.value })}
            placeholder="application/pdf"
          />
        </label>
        {(
          [
            ["min_bytes", "Tamaño mínimo en bytes"],
            ["max_bytes", "Tamaño máximo en bytes"],
            ["from_minute", "Inicio UTC (minutos desde medianoche)"],
            ["until_minute", "Fin UTC (minutos desde medianoche)"],
          ] as const
        ).map(([key, label]) => (
          <label className="field" key={key}>
            {label}
            <input
              type="number"
              min={0}
              max={key.endsWith("minute") ? 1439 : 4294967295}
              value={draft[key] ?? ""}
              onChange={(e) =>
                patch({ [key]: e.target.value ? Number(e.target.value) : null })
              }
            />
          </label>
        ))}
        <label className="field">
          Límite en bytes por segundo
          <input
            type="number"
            min={1}
            max={4294967295}
            value={draft.effect.bytes_per_second ?? ""}
            onChange={(e) =>
              effect({
                bytes_per_second: e.target.value
                  ? Number(e.target.value)
                  : null,
              })
            }
          />
        </label>
        <label className="field">
          Prioridad del trabajo
          <select
            value={draft.effect.priority ?? ""}
            onChange={(e) =>
              effect({
                priority: (e.target.value || null) as RuleEffect["priority"],
              })
            }
          >
            <option value="">Sin cambio</option>
            <option value="high">Alta</option>
            <option value="normal">Normal</option>
            <option value="low">Baja</option>
          </select>
        </label>
      </details>
      <div className="dialog-actions">
        <button
          disabled={busy || !draft.name.trim()}
          onClick={() =>
            void act(() => organize({ action: "save_rule", rule: draft }))
          }
        >
          Guardar regla
        </button>
        <button
          disabled={busy || !state?.rules.some((r) => r.id === draft.id)}
          onClick={() =>
            void act(async () => {
              await organize({ action: "delete_rule", id: draft.id });
              setDraft(blank());
            })
          }
        >
          Eliminar regla
        </button>
      </div>
      <details>
        <summary>Categorías personalizadas</summary>
        <label className="field">
          Nueva categoría
          <input
            value={category}
            maxLength={120}
            onChange={(e) => setCategory(e.target.value)}
          />
        </label>
        <button
          disabled={busy || !category.trim() || !state}
          onClick={() =>
            void act(async () => {
              await organize({
                action: "save_categories",
                categories: [...state!.categories, category.trim()],
              });
              setCategory("");
            })
          }
        >
          Añadir categoría
        </button>
        <p>
          Las cinco categorías iniciales se conservan. Solo se puede quitar una
          personalizada sin trabajos ni reglas asociados.
        </p>
        {state?.categories.slice(5).map((c) => (
          <p key={c}>
            {c}{" "}
            <button
              disabled={busy}
              onClick={() =>
                void act(() =>
                  organize({
                    action: "save_categories",
                    categories: state.categories.filter((x) => x !== c),
                  }),
                )
              }
            >
              Quitar {c}
            </button>
          </p>
        ))}
      </details>
      <details>
        <summary>Previsualizar y aplicar a un trabajo existente</summary>
        <p>
          Solo se usan reglas guardadas y metadatos conocidos. Los destinos
          existentes no se mueven; los trabajos activos se rechazan.
        </p>
        <button disabled={busy} onClick={() => void act(loadJobs)}>
          Cargar trabajos
        </button>
        <label className="field">
          Trabajo
          <select
            value={jobId}
            onChange={(e) => {
              setJobId(e.target.value);
              setPreview(null);
            }}
          >
            <option value="">Elige un trabajo</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.name}
              </option>
            ))}
          </select>
        </label>
        <button disabled={busy || !jobId} onClick={() => void act(previewJob)}>
          Previsualizar reglas guardadas
        </button>
        {preview && (
          <>
            <RuleResult preview={preview} />
            <button
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  await organize({
                    action: "apply_job_rules",
                    job_id: jobId,
                    preview,
                  });
                  setPreview(null);
                })
              }
            >
              Aceptar cambios previsualizados
            </button>
          </>
        )}
      </details>
      <footer className="dialog-actions">
        <button disabled={busy} onClick={onClose}>
          Cerrar
        </button>
      </footer>
    </Modal>
  );
}
