import { useState } from "react";
import { Modal, Pending } from "./ui/Modal";
import { validateDraft } from "./model";
export function NewDownloadDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [reveal, setReveal] = useState(false);
  const [checked, setChecked] = useState(false);
  const errors = checked ? validateDraft(name, url) : {};
  return (
    <Modal title="Nueva descarga" onClose={onClose}>
      <p className="muted">
        Prepara los datos del archivo. Todavía no se enviarán al motor.
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
            <input disabled placeholder="Carpeta de Windows · fase 05" />
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
        <button type="button" disabled aria-describedby="backend-pending">
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
              <select disabled>
                <option>Automáticas · fase 04</option>
              </select>
            </label>
            <label className="field">
              Límite
              <input disabled value="Sin límite · pendiente" readOnly />
            </label>
            <label className="field">
              Prioridad
              <select>
                <option>Normal</option>
                <option>Alta</option>
                <option>Baja</option>
              </select>
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
        <Pending />
        <button type="submit">Validar datos</button>
        {checked && (
          <p role="status">
            {Object.keys(errors).length
              ? "Revisa los campos indicados."
              : "Formato válido. No se ha creado ni iniciado ninguna descarga."}
          </p>
        )}
        <footer className="dialog-actions">
          <button type="button" onClick={onClose}>
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
            disabled
            aria-describedby="backend-pending"
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
