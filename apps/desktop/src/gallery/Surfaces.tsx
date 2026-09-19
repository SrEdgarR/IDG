import { useState } from "react";
import { Modal, Pending } from "../ui/Modal";
import { Icon } from "../ui/Icon";
export function QueueEditor({ onClose }: { onClose: () => void }) {
  const [jobs, setJobs] = useState([
    "Documento de ejemplo",
    "Video de ejemplo",
  ]);
  return (
    <Modal title="Colas y programación" onClose={onClose}>
      <p className="sample-note">
        Galería: el orden se edita solo en esta muestra.
      </p>
      <label className="field">
        Nombre de la cola
        <input defaultValue="Cola de ejemplo" />
      </label>
      <ol>
        {jobs.map((j, i) => (
          <li key={j} className="queue-item">
            {j}
            <button
              disabled={i === 0}
              onClick={() => setJobs([...jobs].reverse())}
              aria-label={`Subir ${j}`}
            >
              Subir
            </button>
          </li>
        ))}
      </ol>
      <div className="form-grid">
        <label className="field">
          Simultáneas
          <input type="number" min="1" max="32" defaultValue="3" />
        </label>
        <label className="field">
          Horario
          <input type="time" defaultValue="22:00" />
        </label>
      </div>
      <label className="field">
        Al terminar
        <select>
          <option>No hacer nada</option>
          <option>Apagar (requiere confirmación futura)</option>
        </select>
      </label>
      <p className="muted">
        La programación necesita el runtime activo y Windows despierto.
      </p>
      <Pending>
        Crear, renombrar, eliminar, iniciar, pausar y guardar colas: fase 06.
      </Pending>
      <footer className="dialog-actions">
        <button onClick={onClose}>Cancelar</button>
        <button disabled>Guardar cola</button>
        <button disabled>Iniciar cola</button>
        <button disabled>Pausar cola</button>
        <button disabled>Eliminar cola</button>
      </footer>
    </Modal>
  );
}
export function RuleEditor({ onClose }: { onClose: () => void }) {
  const [suffix, setSuffix] = useState("pdf");
  const [category, setCategory] = useState("Documentos");
  const [preview, setPreview] = useState(false);
  return (
    <Modal title="Reglas de organización" onClose={onClose}>
      <p className="sample-note">
        Previsualización local con Manual de ejemplo.pdf. Nunca mueve ni borra
        archivos.
      </p>
      <label className="field">
        Extensión del archivo
        <input
          value={suffix}
          onChange={(e) => {
            setSuffix(e.target.value);
            setPreview(false);
          }}
        />
      </label>
      <label className="field">
        Categoría de destino
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {["Videos", "Documentos", "Programas", "Comprimidos", "Otros"].map(
            (c) => (
              <option key={c}>{c}</option>
            ),
          )}
        </select>
      </label>
      <details>
        <summary>Condiciones avanzadas</summary>
        <label className="field">
          Dominio / tamaño
          <input disabled placeholder="Evaluación del motor pendiente" />
        </label>
        <label className="field">
          Prioridad
          <input type="number" min="1" defaultValue="1" />
        </label>
      </details>
      <label className="check-field">
        <input type="checkbox" defaultChecked />
        Regla activa en la muestra
      </label>
      <button onClick={() => setPreview(true)}>Previsualizar</button>
      {preview && (
        <p role="status">
          {suffix.replace(/^\./, "").toLowerCase() === "pdf"
            ? `Coincide: se propondría ${category}.`
            : "No coincide con el archivo de ejemplo."}{" "}
          Los conflictos entre reglas deberán resolverlos las prioridades del
          motor.
        </p>
      )}
      <Pending>Guardar y evaluar reglas reales: fase 06.</Pending>
      <footer className="dialog-actions">
        <button onClick={onClose}>Cancelar</button>
        <button disabled>Guardar regla</button>
      </footer>
    </Modal>
  );
}
export function MediaButton() {
  const [hidden, setHidden] = useState(false);
  const [open, setOpen] = useState(false);
  return (
    <section className="media-preview" aria-label="Reproductor de muestra">
      <p>Superficie de video de ejemplo · sin reproducción</p>
      {hidden ? (
        <button onClick={() => setHidden(false)}>
          Mostrar botón multimedia
        </button>
      ) : (
        <div className="media-button">
          <button onClick={() => setOpen(true)}>
            <Icon name="download" />
            Descargar
          </button>
          <button
            aria-label="Ocultar botón multimedia"
            onClick={() => setHidden(true)}
          >
            <Icon name="close" />
          </button>
        </div>
      )}
      {open && (
        <Modal
          title="Medios del reproductor · muestra"
          onClose={() => setOpen(false)}
        >
          <h3>Paisajes de ejemplo</h3>
          <label className="field">
            Calidad
            <select>
              <option>1080p · tamaño desconocido</option>
              <option>720p · estimado 120 MiB (muestra)</option>
            </select>
          </label>
          <label className="field">
            Modo
            <select>
              <option>Video + audio</option>
              <option>Solo video</option>
              <option>Solo audio</option>
            </select>
          </label>
          <label className="field">
            Procesamiento
            <select>
              <option>Conservar original</option>
              <option>Convertir (no disponible)</option>
            </select>
          </label>
          <details>
            <summary>Avanzado</summary>
            <p>
              Codec, FPS, contenedor e idioma: sin detección. DRM no compatible.
            </p>
          </details>
          <Pending>
            Detección, asociación de reproductor y descarga: fases 09/10.
            Convertir puede perder calidad.
          </Pending>
          <footer className="dialog-actions">
            <button onClick={() => setOpen(false)}>Cancelar</button>
            <button disabled>Descargar medio</button>
          </footer>
        </Modal>
      )}
    </section>
  );
}
export function AuxiliaryViews() {
  const [mini, setMini] = useState(false);
  const [drop, setDrop] = useState(false);
  const [link, setLink] = useState("");
  return (
    <>
      <label className="check-field">
        <input
          type="checkbox"
          checked={mini}
          onChange={(e) => setMini(e.target.checked)}
        />
        Mini ventana (componente de muestra)
      </label>
      <label className="check-field">
        <input
          type="checkbox"
          checked={drop}
          onChange={(e) => setDrop(e.target.checked)}
        />
        Zona de arrastre (muestra)
      </label>
      {mini && (
        <section className="mini-preview">
          <strong>Mini progreso · ejemplo</strong>
          <button
            aria-label="Cerrar mini ventana de muestra"
            onClick={() => setMini(false)}
          >
            <Icon name="close" />
          </button>
          <p>Sin medidas · ninguna descarga real</p>
        </section>
      )}
      {drop && (
        <section
          className="drop-preview"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const text = e.dataTransfer.getData("text/uri-list").split("\n")[0];
            try {
              const url = new URL(text);
              setLink(
                ["https:", "http:"].includes(url.protocol)
                  ? `Enlace recibido para muestra: ${url.hostname}`
                  : "Esquema no admitido",
              );
            } catch {
              setLink("No es un enlace válido");
            }
          }}
        >
          <Icon name="link" />
          <label className="field">
            Enlace de muestra
            <input
              placeholder="Pega o arrastra un enlace"
              type="url"
              onChange={(e) => {
                try {
                  setLink(
                    `Host de muestra: ${new URL(e.target.value).hostname}`,
                  );
                } catch {
                  setLink("Introduce un enlace válido");
                }
              }}
            />
          </label>
          <p role="status">
            {link || "No se inicia ni guarda ninguna descarga."}
          </p>
          <button onClick={() => setDrop(false)}>Cerrar zona</button>
        </section>
      )}
    </>
  );
}
export function RecoverySamples() {
  const [issue, setIssue] = useState("Disco lleno");
  return (
    <>
      <label className="field">
        Estado de recuperación
        <select value={issue} onChange={(e) => setIssue(e.target.value)}>
          {[
            "Disco lleno",
            "Permiso rechazado",
            "Archivo no encontrado",
            "Hash no coincidente",
            "URL vencida",
            "Conversión fallida",
            "Actualización disponible",
            "Modo privado",
          ].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </label>
      <div role="alert" className="recovery">
        <Icon name="error" />
        <strong>{issue}</strong>
        <p>
          Estado de ejemplo.{" "}
          {issue === "Actualización disponible"
            ? "No hay versiones publicadas ni datos reales de actualización."
            : "La acción de recuperación requiere información verificada del motor."}
        </p>
        <button disabled>
          {issue === "Actualización disponible"
            ? "Actualizar y reiniciar"
            : "Reintentar"}
        </button>
      </div>
    </>
  );
}
