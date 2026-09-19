import { useState } from "react";
import { Modal, Pending } from "./ui/Modal";
import type { Theme } from "./ui/appearance";
const sections = [
  "General y apariencia",
  "Descargas",
  "Navegadores",
  "Conexión",
  "Video y audio",
  "Colas y programación",
  "Notificaciones",
  "Privacidad",
  "Actualizaciones",
];
const options: Record<string, string[]> = {
  Descargas: [
    "Carpeta de descargas",
    "Organización por tipo",
    "Descargas simultáneas",
    "Límite de velocidad",
    "Categorías",
    "Conflictos de archivo",
  ],
  Navegadores: [
    "AutoPick global y por sitio",
    "Excepciones por formato y tamaño",
    "Conexiones con navegadores",
    "Botón multimedia",
  ],
  Conexión: ["Concurrencia", "Proxy", "Autenticación", "Protocolos"],
  "Video y audio": [
    "Calidad",
    "Pistas e idioma",
    "Conservar original o convertir",
    "Contenedor",
    "Estado de FFmpeg",
  ],
  "Colas y programación": ["Colas", "Horarios", "Acción al terminar"],
  Notificaciones: [
    "Inicio",
    "Fin",
    "Error",
    "Conectividad",
    "Sonidos",
    "Acciones",
  ],
  Privacidad: [
    "Historial",
    "Modo privado",
    "Estadísticas (recopilación desactivada)",
    "Diagnóstico",
    "Telemetría (desactivada)",
  ],
  Actualizaciones: [
    "Buscar automáticamente",
    "Comprobar ahora",
    "Actualizar y reiniciar",
  ],
};
export function Settings({
  onClose,
  theme,
  setTheme,
  stats,
  setStats,
  mode,
  setMode,
}: {
  onClose: () => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
  stats: boolean;
  setStats: (b: boolean) => void;
  mode: string;
  setMode: (mode: string) => void;
}) {
  const [section, setSection] = useState(sections[0]);
  return (
    <Modal title="Configuración" onClose={onClose} wide>
      <div className="settings-layout">
        <nav aria-label="Secciones de configuración">
          {sections.map((s) => (
            <button
              key={s}
              aria-current={section === s ? "page" : undefined}
              onClick={() => setSection(s)}
            >
              {s}
            </button>
          ))}
        </nav>
        <section>
          <h3>{section}</h3>
          {section === sections[0] ? (
            <>
              <label className="field">
                Tema
                <select
                  aria-label="Tema"
                  value={theme}
                  onChange={(e) => setTheme(e.target.value as Theme)}
                >
                  <option value="system">Sistema</option>
                  <option value="light">Claro</option>
                  <option value="dark">Oscuro</option>
                </select>
              </label>
              <p className="muted">
                Se guarda solo la apariencia en este escritorio. Sistema
                responde a los cambios de Windows.
              </p>
              <label className="field">
                Densidad / vista
                <select
                  aria-label="Vista de filas"
                  value={mode}
                  onChange={(e) => setMode(e.target.value)}
                >
                  <option>Automática</option>
                  <option>Compacta</option>
                  <option>Expandida</option>
                </select>
              </label>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={stats}
                  onChange={(e) => setStats(e.target.checked)}
                />
                Mostrar sección de estadísticas
              </label>
              <p className="muted">
                Solo muestra su estado vacío durante esta sesión; no recopila
                datos.
              </p>
              {[
                "Idioma: Español",
                "Inicio con Windows",
                "Comportamiento de X",
                "Mini ventana",
                "Zona de arrastre",
                "Monitorizar portapapeles",
              ].map((t) => (
                <label className="check-field" key={t}>
                  <input type="checkbox" disabled />
                  {t}
                </label>
              ))}
              <p className="pending">
                Integración con Windows pendiente de fases 05/06/13. Hoy X
                cierra el escritorio y conserva el runtime.
              </p>
            </>
          ) : (
            <>
              <p className="muted">
                Estructura de ajustes. Las opciones se conectarán al runtime en
                sus fases; aquí no se guardan cambios efectivos.
              </p>
              <fieldset disabled>
                <legend>Opciones pendientes</legend>
                {options[section].map((t) => (
                  <label className="field" key={t}>
                    {t}
                    <input placeholder="No disponible todavía" />
                  </label>
                ))}
              </fieldset>
              <Pending>
                {section === "Actualizaciones"
                  ? "No hay versiones publicadas ni un actualizador conectado."
                  : "Sin backend disponible. Consulta el inventario de controles para la fase de integración."}
              </Pending>
            </>
          )}
        </section>
      </div>
      <footer className="dialog-actions">
        <button onClick={onClose}>Cerrar</button>
      </footer>
    </Modal>
  );
}
export function FirstRunWizard({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [organize, setOrganize] = useState(false);
  const [auto, setAuto] = useState("Preguntarme");
  const names = ["Bienvenida", "Carpeta", "Navegadores", "AutoPick"];
  return (
    <Modal title="Primera configuración" onClose={onClose}>
      <p className="sample-note">
        Vista de galería · no configura Windows ni el motor.
      </p>
      <ol className="steps">
        {names.map((n, i) => (
          <li key={n} aria-current={step === i ? "step" : undefined}>
            {i + 1}. {n}
          </li>
        ))}
      </ol>
      <h3>{names[step]}</h3>
      {step === 0 ? (
        <>
          <h2>Tus archivos, en orden.</h2>
          <p>
            Elige dónde guardar y cómo conectar tu navegador. Sin cuentas ni
            suscripciones.
          </p>
        </>
      ) : step === 1 ? (
        <>
          <label className="field">
            Carpeta inicial
            <input
              disabled
              placeholder="Descargas de Windows · no consultada"
            />
          </label>
          <button disabled>Elegir carpeta…</button>
          <label className="check-field">
            <input
              type="checkbox"
              checked={organize}
              onChange={(e) => setOrganize(e.target.checked)}
            />
            Organizar por tipo
          </label>
        </>
      ) : step === 2 ? (
        <>
          <p>
            No se detectan instalaciones desde esta galería. Detectado,
            instalado y conectado son estados distintos.
          </p>
          <p>
            Solo existe carga de desarrollo: sigue docs/DESARROLLO.md. No hay
            publicación en tiendas.
          </p>
          <button onClick={() => setStep(3)}>Omitir navegador</button>
        </>
      ) : (
        <>
          <label className="field">
            AutoPick
            <select
              aria-label="AutoPick"
              value={auto}
              onChange={(e) => setAuto(e.target.value)}
            >
              {["Siempre usar IDG", "Preguntarme", "Usar el navegador"].map(
                (t) => (
                  <option key={t}>{t}</option>
                ),
              )}
            </select>
          </label>
          <p className="muted">
            Siempre usar IDG seguirá abriendo un diálogo de revisión. Esta
            elección de muestra no activa captura.
          </p>
        </>
      )}
      <footer className="dialog-actions">
        <button onClick={onClose}>Cerrar muestra</button>
        <button disabled={step === 0} onClick={() => setStep(step - 1)}>
          Atrás
        </button>
        {step < 3 ? (
          <button className="primary" onClick={() => setStep(step + 1)}>
            Siguiente
          </button>
        ) : (
          <button className="primary" onClick={onClose}>
            Terminar vista previa
          </button>
        )}
      </footer>
    </Modal>
  );
}
