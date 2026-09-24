import { RuleResult } from "./Rules";
import type { RulePreview } from "../../../packages/shared-types/protocol";
import type { DesktopApi } from "./desktop";
import { DownloadFailure, execute } from "./desktop";
import { useOrganization } from "./Organization";
import { useState, useRef, useEffect } from "react";
import type {
  StartPolicy,
  ConflictPolicy,
} from "../../../packages/shared-types/protocol";
import { Modal, Pending } from "./ui/Modal";
import { validateDraft } from "./model";
export function NewDownloadDialog({
  onClose,
  backend,
  initialUrl = "",
  initialName = "",
  captureId,
  onAccepted,
}: {
  onClose: () => void;
  backend?: DesktopApi;
  initialUrl?: string;
  initialName?: string;
  captureId?: string;
  onAccepted?: () => void;
}) {
  const [directory, setDirectory] = useState("");
  const { state: organization } = useOrganization(Boolean(backend));
  const [queueId, setQueueId] = useState("main");
  const [applyRules, setApplyRules] = useState(true),
    [ruleOverrides, setRuleOverrides] = useState<string[]>([]),
    [rulePreview, setRulePreview] = useState<RulePreview | null>(null);
  const override = (key: string) => {
    setRuleOverrides((old) => (old.includes(key) ? old : [...old, key]));
    setRulePreview(null);
  };
  const directoryEdited = useRef(false);
  const [category, setCategory] = useState("Otros");
  const [conflict, setConflict] = useState<ConflictPolicy>("reject");
  const [conflictOpen, setConflictOpen] = useState(false);
  const [recoverable, setRecoverable] = useState<string | null>(null);
  const [pendingStart, setPendingStart] = useState<StartPolicy>("now");
  useEffect(() => {
    if (backend)
      void backend
        .preferences()
        .then((p) => {
          if (!directoryEdited.current) setDirectory(p.directory);
        })
        .catch(() => {});
  }, [backend]);
  const [replaySafe, setReplaySafe] = useState(false);
  const [requests, setRequests] = useState("automatic");
  const [limit, setLimit] = useState("");
  const [priority, setPriority] = useState<"normal" | "high" | "low">("normal");
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const requestId = useRef(crypto.randomUUID());
  async function submit(
    start: StartPolicy = "now",
    policy: ConflictPolicy = conflict,
  ) {
    if (!backend || sending.current) return;
    setChecked(true);
    setFailure("");
    if (Object.keys(validateDraft(name, url)).length || !directory) {
      setFailure("Revisa URL, nombre y carpeta.");
      return;
    }
    if (captureId && !replaySafe) {
      setFailure("Para transferir desde Chromium, confirma que este GET público puede repetirse sin una sesión ni un token de un solo uso. Si tienes dudas, cancela y deja la descarga en el navegador.");
      return;
    }
    sending.current = true;
    setBusy(true);
    setRecoverable(null);
    try {
      if (policy === "reject" && !captureId) {
        const match = await backend.recoverable({
          url,
          directory,
          name,
          expected_sha256: null,
          conflict: policy,
        });
        if (match) {
          setRecoverable(match);
          setPendingStart(start);
          setConflictOpen(true);
          return;
        }
      }
      const result = await backend.add(
        captureId ?? requestId.current,
        { url, directory, name, expected_sha256: null, conflict: policy },
        {
          mode:
            requests === "automatic"
              ? "automatic"
              : { manual: { requests: Number(requests) } },
          replay_safe: replaySafe,
          bytes_per_second: limit ? Number(limit) * 1024 : null,
          priority,
        },
        category,
        captureId ? "later" : start,
        queueId,
        applyRules,
        ruleOverrides,
        captureId ? `extension:${captureId}` : "",
      );
      if (result.kind !== "download")
        throw new Error("El motor no confirmó el trabajo.");
      if (captureId) onAccepted?.();
      else onClose();
    } catch (e) {
      setFailure(e instanceof Error ? e.message : String(e));
      if (e instanceof DownloadFailure && e.code === "conflict") {
        setPendingStart(start);
        setConflictOpen(true);
      }
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  const [name, setName] = useState(initialName);
  const [url, setUrl] = useState(initialUrl);
  const [reveal, setReveal] = useState(false);
  const [checked, setChecked] = useState(false);
  const errors = checked ? validateDraft(name, url) : {};
  return (
    <Modal
      title="Nueva descarga"
      onClose={() => {
        if (!sending.current) onClose();
      }}
    >
      <p className="muted">
        {captureId
          ? "Chromium conserva la descarga original hasta que IDG confirme un trabajo persistido y reciba datos. Si cancelas, continúa en el navegador."
          : backend
          ? "Revisa el destino. No se consulta el enlace hasta aceptar la descarga."
          : "Prepara los datos del archivo. Todavía no se enviarán al motor."}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setChecked(true);
        }}
        noValidate
      >
        <label className="field">
          URL del archivo
          <input
            type={reveal ? "text" : "password"}
            value={url}
            readOnly={!!captureId}
            autoComplete="off"
            spellCheck={false}
            required
            aria-invalid={!!errors.url}
            aria-describedby="url-help url-error"
            onChange={(e) => setUrl(e.target.value)}
          />
        </label>
        <small id="url-help" className="muted">
          Se oculta para proteger enlaces privados. No se consulta la red.
        </small>
        <label className="check-field">
          <input
            type="checkbox"
            checked={reveal}
            onChange={(e) => setReveal(e.target.checked)}
          />
          Mostrar URL
        </label>
        <p id="url-error" className="error-text">
          {errors.url}
        </p>
        <label className="field">
          Nombre del archivo
          <input
            value={name}
            readOnly={!!captureId}
            required
            aria-invalid={!!errors.name}
            aria-describedby="name-error"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <p id="name-error" className="error-text">
          {errors.name}
        </p>
        <div className="form-grid">
          <label className="field">
            Carpeta
            <input
              disabled={!backend || busy}
              value={directory}
              onFocus={() => {
                directoryEdited.current = true;
              }}
              onChange={(e) => {
                directoryEdited.current = true;
                setDirectory(e.target.value);
                override("directory");
              }}
              placeholder="Elige una carpeta"
            />
          </label>
          <label className="field">
            Categoría
            <select
              aria-label="Categoría"
              value={backend ? category : undefined}
              defaultValue={backend ? undefined : "Automática"}
              onChange={(e) => {
                setCategory(e.target.value);
                override("category");
              }}
            >
              {!backend && <option>Automática</option>}
              {(
                organization?.categories ?? [
                  "Videos",
                  "Documentos",
                  "Programas",
                  "Comprimidos",
                  "Otros",
                ]
              ).map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
        <button
          type="button"
          disabled={!backend || busy}
          onClick={() =>
            void backend
              ?.chooseFolder()
              .then((folder) => {
                if (folder) {
                  directoryEdited.current = true;
                  setDirectory(folder);
                  override("directory");
                }
              })
              .catch(() => setFailure("No se pudo elegir la carpeta."))
          }
        >
          Elegir carpeta…
        </button>
        <dl className="metadata">
          <div>
            <dt>Tamaño / tipo</dt>
            <dd>Desconocidos</dd>
          </div>
          <div>
            <dt>Sitio de origen</dt>
            <dd>No comprobado</dd>
          </div>
          <div>
            <dt>Reanudabilidad</dt>
            <dd>Desconocida</dd>
          </div>
        </dl>
        {backend && (
          <label className="field">
            Si existe el destino
            <select
              value={conflict}
              onChange={(e) => setConflict(e.target.value as ConflictPolicy)}
            >
              <option value="reject">Preguntar (conservar el archivo)</option>
              <option value="rename">Renombrar automáticamente</option>
              <option value="replace">
                Reemplazar explícitamente al completar
              </option>
            </select>
            <small>
              Reemplazar solo publica tras verificar. Reanudar requiere el
              trabajo original y su checkpoint; no basta el nombre.
            </small>
          </label>
        )}
        <details>
          <summary>Avanzado</summary>
          {backend && (
            <section>
              <label>
                <input
                  type="checkbox"
                  checked={applyRules}
                  onChange={(e) => {
                    setApplyRules(e.target.checked);
                    setRulePreview(null);
                  }}
                />{" "}
                Aplicar reglas guardadas a esta descarga
              </label>
              <p>
                Los campos que cambies explícitamente prevalecen. No se consulta
                la URL para obtener tamaño o tipo.
              </p>
              <button
                type="button"
                disabled={busy || !applyRules}
                onClick={() =>
                  void execute({
                    organization: {
                      operation: {
                        action: "preview_rules",
                        input: {
                          url,
                          directory,
                          name,
                          expected_sha256: null,
                          conflict,
                        },
                        overrides: ruleOverrides,
                      },
                    },
                  })
                    .then((r) => {
                      if (r.kind === "rule_preview") setRulePreview(r.preview);
                    })
                    .catch((e) => setFailure(String(e)))
                }
              >
                Previsualizar reglas
              </button>
              {rulePreview && <RuleResult preview={rulePreview} />}
            </section>
          )}
          {backend && (
            <label className="field">
              Cola de descarga
              <select
                value={queueId}
                onChange={(e) => {
                  setQueueId(e.target.value);
                  override("queue_id");
                }}
              >
                {organization?.queues.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="form-grid">
            <label className="field">
              Conexiones
              <select
                disabled={!backend || busy}
                value={requests}
                onChange={(e) => setRequests(e.target.value)}
              >
                <option value="automatic">Automáticas</option>
                {[1, 2, 4, 8, 16, 32].map((n) => (
                  <option key={n} value={n}>
                    {n} solicitudes como máximo
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Límite
              <input
                type="number"
                min="1"
                max="4194303"
                disabled={!backend || busy}
                value={limit}
                onChange={(e) => {
                  setLimit(e.target.value);
                  override("bytes_per_second");
                }}
                placeholder="Sin límite (KiB/s)"
              />
            </label>
            <label className="field">
              Prioridad
              <select
                value={priority}
                onChange={(e) => {
                  setPriority(e.target.value as typeof priority);
                  override("priority");
                }}
              >
                <option value="normal">Normal</option>
                <option value="high">Alta</option>
                <option value="low">Baja</option>
              </select>
            </label>
          </div>
          <p className="muted">
            Proxy y datos de solicitud protegidos: fases 11–12.
          </p>
          <label className="field">
            Proxy
            <select disabled aria-describedby="backend-pending">
              <option>Configuración heredada · pendiente</option>
            </select>
          </label>
          <label className="field">
            Datos de solicitud permitidos
            <input
              type="password"
              disabled
              placeholder="Importación segura pendiente · sin datos privados"
              aria-describedby="backend-pending"
            />
          </label>
        </details>
        {backend ? (
          <>
            <label className="check-field">
              <input
                type="checkbox"
                disabled={busy}
                checked={replaySafe}
                onChange={(e) => setReplaySafe(e.target.checked)}
              />
              El enlace permite solicitudes repetidas
            </label>
            <p className="muted">
              {captureId ? "Obligatorio para transferir desde Chromium: confirma que es un GET público, repetible y sin sesión. Si no estás seguro, cancela y usa el navegador." : "Actívalo solo para un enlace reutilizable. Ante dudas o enlaces de un solo uso se usa una solicitud secuencial; Automático no anula esta protección."}
            </p>
          </>
        ) : (
          <Pending />
        )}
        {failure && (
          <p role="alert" className="error-text">
            {failure}
          </p>
        )}
        <button type="submit">Validar datos</button>
        {checked && (
          <p role="status">
            {Object.keys(errors).length
              ? "Revisa los campos indicados."
              : "Formato válido. No se ha creado ni iniciado ninguna descarga."}
          </p>
        )}
        <footer className="dialog-actions">
          <button type="button" disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          {!captureId && <button
            type="button"
            disabled={!backend || busy}
            onClick={() => void submit("later")}
          >
            Descargar después
          </button>}
          {!captureId && <button
            type="button"
            disabled={!backend || busy}
            onClick={() => void submit("queue")}
          >
            Añadir a cola
          </button>}
          <button
            type="button"
            className="primary"
            disabled={!backend || busy}
            onClick={() => void submit()}
          >
            {captureId ? "Aceptar en IDG" : "Descargar ahora"}
          </button>
        </footer>
      </form>
      {conflictOpen && (
        <ExistingFileDialog
          name={name}
          onResume={
            recoverable
              ? () => {
                  void backend
                    ?.action(recoverable, "resume")
                    .then(() => onClose())
                    .catch((e) => {
                      setFailure(String(e));
                      setConflictOpen(false);
                    });
                }
              : undefined
          }
          onResolve={(choice) => {
            setConflict(choice);
            setConflictOpen(false);
            void submit(pendingStart, choice);
          }}
          onClose={() => setConflictOpen(false)}
        />
      )}
    </Modal>
  );
}
export function ExistingFileDialog({
  onClose,
  name,
  onResolve,
  onResume,
}: {
  onClose: () => void;
  name?: string;
  onResolve?: (choice: ConflictPolicy) => void;
  onResume?: () => void;
}) {
  const [choice, setChoice] = useState("rename");
  return (
    <Modal title="Ya existe un archivo con este nombre" onClose={onClose}>
      <p className="sample-note">
        {onResolve
          ? "El runtime rechazó el destino. El archivo existente se conserva hasta una publicación autorizada y verificada."
          : "Muestra de galería. No se consulta ni modifica el disco."}
      </p>
      <div className="file-conflict">
        <strong>{name ?? "Manual de ejemplo.pdf"}</strong>
        {!onResolve && (
          <>
            <p className="muted">Descargas / Manual de ejemplo.pdf</p>
            <small>2,4 MiB · 19 septiembre 2026 · datos de ejemplo</small>
          </>
        )}
      </div>
      <label className="check-field">
        <input
          type="radio"
          name="conflict"
          checked={choice === "rename"}
          onChange={() => setChoice("rename")}
        />
        Renombrar automáticamente
      </label>
      <p className="muted">
        {onResolve
          ? "El motor elegirá un nombre disponible al publicar."
          : "Vista previa: Manual de ejemplo (1).pdf. El motor deberá reservar el nombre."}
      </p>
      <label className="check-field">
        <input
          type="radio"
          name="conflict"
          checked={choice === "replace"}
          onChange={() => setChoice("replace")}
        />
        Sobrescribir
      </label>
      {choice === "replace" && (
        <p role="alert" className="error-text">
          Se requiere confirmar el reemplazo del archivo indicado. No se borrará
          nada{" "}
          {onResolve
            ? "antes de completar y verificar la descarga nueva"
            : "en esta galería"}
          .
        </p>
      )}
      <label className="check-field">
        <input
          type="radio"
          disabled={!onResume}
          checked={choice === "resume"}
          onChange={() => setChoice("resume")}
          name="conflict"
        />
        Reanudar
      </label>
      <p className="muted">
        {onResume
          ? "Parcial identificado por URL, destino, validador y hashes durables. La respuesta HTTP debe validar la misma representación antes de continuar."
          : "No disponible: la identidad del parcial no ha sido verificada."}
      </p>
      {!onResolve && <Pending />}
      <footer className="dialog-actions">
        <button onClick={onClose}>Cancelar</button>
        <button
          disabled={!onResolve}
          onClick={() =>
            choice === "resume"
              ? onResume?.()
              : onResolve?.(choice as ConflictPolicy)
          }
          aria-describedby={onResolve ? undefined : "backend-pending"}
        >
          {choice === "resume"
            ? "Reanudar parcial validado"
            : choice === "replace"
              ? "Confirmar sobrescritura"
              : "Usar nombre propuesto"}
        </button>
      </footer>
    </Modal>
  );
}
export function ConfirmDialog({
  name,
  onClose,
}: {
  name: string;
  onClose: () => void;
}) {
  return (
    <Modal title="Eliminar del disco" onClose={onClose}>
      <p>Archivo seleccionado:</p>
      <ul>
        <li>{name}</li>
      </ul>
      <p className="error-text">
        Eliminar del disco es distinto de quitar del historial.
      </p>
      <Pending>
        No se eliminará ningún archivo. Validación de propiedad y Papelera
        pendientes de fase 12.
      </Pending>
      <footer className="dialog-actions">
        <button onClick={onClose}>Cancelar</button>
        <button className="danger" disabled aria-describedby="backend-pending">
          Eliminar archivo
        </button>
      </footer>
    </Modal>
  );
}
