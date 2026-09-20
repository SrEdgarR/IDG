import type {DesktopApi} from "./desktop";
import { useState, useRef } from "react";
import { Modal, Pending } from "./ui/Modal";
import { validateDraft } from "./model";
export function NewDownloadDialog({ onClose, backend }: { onClose: () => void; backend?: DesktopApi }) {
  const [directory, setDirectory] = useState("");
  const [replaySafe, setReplaySafe] = useState(false);
  const [requests, setRequests] = useState("automatic");
  const [limit, setLimit] = useState("");
  const [priority, setPriority] = useState<"normal" | "high" | "low">("normal");
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const requestId = useRef(crypto.randomUUID());
  async function submit() {
    if (!backend || sending.current) return;
    setChecked(true);setFailure("");
    if (Object.keys(validateDraft(name,url)).length || !directory) {setFailure("Revisa URL, nombre y carpeta.");return;}
    sending.current=true;setBusy(true);
    try {
      const result=await backend.add(requestId.current,{url,directory,name,expected_sha256:null,conflict:"reject"},{mode:requests==="automatic"?"automatic":{manual:{requests:Number(requests)}},replay_safe:replaySafe,bytes_per_second:limit?Number(limit)*1024:null,priority});
      if(result.kind!=="download") throw new Error("El motor no confirmó el trabajo.");
      onClose();
    } catch(e) {setFailure(e instanceof Error?e.message:String(e));}
    finally {sending.current=false;setBusy(false);}
  }
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [reveal, setReveal] = useState(false);
  const [checked, setChecked] = useState(false);
  const errors = checked ? validateDraft(name, url) : {};
  return (
    <Modal title="Nueva descarga" onClose={onClose}>
      <p className="muted">
        {backend ? "Revisa el destino. No se consulta el enlace hasta aceptar la descarga." : "Prepara los datos del archivo. Todavía no se enviarán al motor."}
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
            <input disabled={!backend || busy} value={directory} onChange={e=>setDirectory(e.target.value)} placeholder="Elige una carpeta" />
          </label>
          <label className="field">
            Categoría
            <select defaultValue="Automática">
              <option>Automática</option>
              {[
                "Videos",
                "Documentos",
                "Programas",
                "Comprimidos",
                "Otros",
              ].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
        <button type="button" disabled={!backend || busy} onClick={()=>void backend?.chooseFolder().then(folder=>{if(folder)setDirectory(folder);}).catch(()=>setFailure("No se pudo elegir la carpeta."))}>
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
        <details>
          <summary>Avanzado</summary>
          <div className="form-grid">
            <label className="field">
              Conexiones
              <select disabled={!backend || busy} value={requests} onChange={e=>setRequests(e.target.value)}><option value="automatic">Automáticas</option>{[1,2,4,8,16,32].map(n=><option key={n} value={n}>{n} solicitudes como máximo</option>)}</select>
            </label>
            <label className="field">
              Límite
              <input type="number" min="1" max="4194303" disabled={!backend || busy} value={limit} onChange={e=>setLimit(e.target.value)} placeholder="Sin límite (KiB/s)" />
            </label>
            <label className="field">
              Prioridad
              <select value={priority} onChange={e=>setPriority(e.target.value as typeof priority)}><option value="normal">Normal</option><option value="high">Alta</option><option value="low">Baja</option></select>
            </label>
            <label className="field">
              Cola
              <select disabled>
                <option>No disponible · fase 06</option>
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
        {backend ? <><label className="check-field"><input type="checkbox" disabled={busy} checked={replaySafe} onChange={e=>setReplaySafe(e.target.checked)} />El enlace permite solicitudes repetidas</label><p className="muted">Actívalo solo para un enlace reutilizable. Ante dudas o enlaces de un solo uso se usa una solicitud secuencial; Automático no anula esta protección.</p></> : <Pending />}
        {failure && <p role="alert" className="error-text">{failure}</p>}
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
          <button type="button" disabled aria-describedby="backend-pending">
            Descargar después
          </button>
          <button type="button" disabled aria-describedby="backend-pending">
            Añadir a cola
          </button>
          <button
            type="button"
            className="primary"
            disabled={!backend || busy}
            onClick={()=>void submit()}
          >
            Descargar ahora
          </button>
        </footer>
      </form>
    </Modal>
  );
}
export function ExistingFileDialog({ onClose }: { onClose: () => void }) {
  const [choice, setChoice] = useState("rename");
  return (
    <Modal title="Ya existe un archivo con este nombre" onClose={onClose}>
      <p className="sample-note">
        Muestra de galería. No se consulta ni modifica el disco.
      </p>
      <div className="file-conflict">
        <strong>Manual de ejemplo.pdf</strong>
        <p className="muted">Descargas / Manual de ejemplo.pdf</p>
        <small>2,4 MiB · 19 septiembre 2026 · datos de ejemplo</small>
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
        Vista previa: Manual de ejemplo (1).pdf. El motor deberá reservar el
        nombre.
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
          nada en esta galería.
        </p>
      )}
      <label className="check-field">
        <input type="radio" disabled name="conflict" />
        Reanudar
      </label>
      <p className="muted">
        No disponible: la identidad del parcial no ha sido verificada.
      </p>
      <Pending />
      <footer className="dialog-actions">
        <button onClick={onClose}>Cancelar</button>
        <button disabled aria-describedby="backend-pending">
          {choice === "replace"
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
