import { useState } from "react";
import { createRoot } from "react-dom/client";
import { App } from "../App";
import { examples } from "./fixtures";
import { ExistingFileDialog } from "../Dialogs";
import { FirstRunWizard } from "../Settings";
import { Modal } from "../ui/Modal";
import {
  QueueEditor,
  RuleEditor,
  MediaButton,
  AuxiliaryViews,
  RecoverySamples,
} from "./Surfaces";
import "../../../../packages/ui/tokens.css";
import "../style.css";
import "../workspace.css";
function Gallery() {
  const [count, setCount] = useState(3);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState("normal");
  const [surface, setSurface] = useState("");
  const rows = examples(count).map((r) =>
    r.id === "sample-0"
      ? { ...r, received: Number(r.received) + revision * 1024 ** 2 }
      : r,
  );
  return (
    <App
      rows={rows}
      previewState={state}
      connection={
        <div className="runtime">
          <strong>Galería de componentes</strong>
          <span className="muted">
            Datos estáticos de ejemplo · sin conexión al runtime · sin
            persistencia de trabajos
          </span>
        </div>
      }
      galleryTools={
        <>
          <div className="gallery-banner">
            <strong>GALERÍA · NO SON DESCARGAS REALES</strong>
            <label>
              Muestras
              <select
                aria-label="Cantidad de muestras"
                value={count}
                onChange={(e) => {
                  setCount(Number(e.target.value));
                  setRevision(0);
                }}
              >
                {[0, 1, 3, 20].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
            <label>
              Estado
              <select
                aria-label="Estado de muestra"
                value={state}
                onChange={(e) => setState(e.target.value)}
              >
                <option value="normal">Normal</option>
                <option value="loading">Cargando</option>
                <option value="offline">Desconectado</option>
                <option value="error">Error</option>
              </select>
            </label>
            <button onClick={() => setRevision(revision + 1)}>
              Actualizar muestra
            </button>
            {[
              "Conflicto",
              "Asistente",
              "Colas",
              "Reglas",
              "Multimedia",
              "Avisos",
              "Opcionales",
            ].map((s) => (
              <button key={s} onClick={() => setSurface(s)}>
                {s}
              </button>
            ))}
          </div>
          {surface === "Conflicto" && (
            <ExistingFileDialog onClose={() => setSurface("")} />
          )}{" "}
          {surface === "Asistente" && (
            <FirstRunWizard onClose={() => setSurface("")} />
          )}{" "}
          {surface === "Colas" && (
            <QueueEditor onClose={() => setSurface("")} />
          )}{" "}
          {surface === "Reglas" && (
            <RuleEditor onClose={() => setSurface("")} />
          )}{" "}
          {["Multimedia", "Avisos", "Opcionales"].includes(surface) && (
            <Modal
              title={`${surface} · galería`}
              wide
              onClose={() => setSurface("")}
            >
              {surface === "Multimedia" ? (
                <MediaButton />
              ) : surface === "Avisos" ? (
                <RecoverySamples />
              ) : (
                <AuxiliaryViews />
              )}
            </Modal>
          )}
        </>
      }
    />
  );
}
createRoot(document.getElementById("root")!).render(<Gallery />);
