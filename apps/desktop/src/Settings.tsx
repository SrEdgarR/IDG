import { useState, useEffect } from "react";
import { execute, type DesktopApi } from "./desktop";
import type {
  AppPreferences,
  ResourceLimits,
} from "../../../packages/shared-types/protocol";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { ConnectionState } from "../../../packages/shared-types/protocol";
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
  backend,
  preferences,
  savePreferences,
}: {
  onClose: () => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
  stats: boolean;
  setStats: (b: boolean) => void;
  mode: string;
  setMode: (mode: string) => void;
  backend?: DesktopApi;
  preferences?: AppPreferences | null;
  savePreferences?: (change: Partial<AppPreferences>) => Promise<void>;
}) {
  const [section, setSection] = useState(sections[0]);
  const [error, setError] = useState("");
  const save = (change: Partial<AppPreferences>) =>
    void savePreferences?.(change).catch((e) => setError(String(e)));
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
          {error && <p role="alert">{error}</p>}
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
                {backend
                  ? "El runtime guarda las preferencias."
                  : "Se guarda solo la apariencia en este escritorio."}{" "}
                Sistema responde a los cambios de Windows.
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
              ]
                .filter(
                  (t) =>
                    !backend ||
                    ![
                      "Comportamiento de X",
                      "Mini ventana",
                      "Zona de arrastre",
                    ].includes(t),
                )
                .map((t) => (
                  <label className="check-field" key={t}>
                    <input type="checkbox" disabled />
                    {t}
                  </label>
                ))}
              {backend && preferences ? (
                <>
                  <label className="field">
                    Comportamiento de X
                    <select
                      value={preferences.close_action}
                      onChange={(e) => save({ close_action: e.target.value })}
                    >
                      <option value="hide">Ocultar en bandeja</option>
                      <option value="exit">Salir completamente</option>
                      <option value="ask">Preguntar</option>
                    </select>
                  </label>
                  <label className="check-field">
                    <input
                      type="checkbox"
                      checked={preferences.mini_window}
                      onChange={(e) => save({ mini_window: e.target.checked })}
                    />
                    Mini ventana de progreso
                  </label>
                  <label className="check-field">
                    <input
                      type="checkbox"
                      checked={preferences.drop_target}
                      onChange={(e) => save({ drop_target: e.target.checked })}
                    />
                    Zona para soltar enlaces
                  </label>
                </>
              ) : (
                <p className="pending">
                  Integración con Windows pendiente de fases 05/06/13. Hoy X
                  cierra el escritorio y conserva el runtime.
                </p>
              )}
            </>
          ) : backend && preferences && section === "Descargas" ? (
            <>
              <label className="field">
                Carpeta de descargas
                <input readOnly value={preferences.directory} />
              </label>
              <button
                onClick={() =>
                  void backend
                    .chooseFolder()
                    .then((directory) => {
                      if (directory) save({ directory });
                    })
                    .catch((e) => setError(String(e)))
                }
              >
                Elegir carpeta…
              </button>
              <LimitsSettings />
            </>
          ) : backend && preferences && section === "Notificaciones" ? (
            <>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={preferences.notify_completed}
                  onChange={(e) => save({ notify_completed: e.target.checked })}
                />
                Avisar al completar
              </label>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={preferences.notify_failed}
                  onChange={(e) => save({ notify_failed: e.target.checked })}
                />
                Avisar de errores
              </label>
              <p>
                Sin sonido. Los avisos permiten abrir la carpeta o revisar el
                trabajo.
              </p>
              <p className="muted">
                Las acciones están dentro de IDG. Windows decide si muestra el
                aviso del sistema; en esta compilación de desarrollo puede
                identificarlo como PowerShell. La identidad definitiva requiere
                la futura instalación.
              </p>
            </>
          ) : backend && preferences && section === "Navegadores" ? (
            <>
              <BrowserStatus />
              <label className="field">
                Preferencia de AutoPick
                <select
                  value={preferences.autopick_mode}
                  onChange={(e) => save({ autopick_mode: e.target.value })}
                >
                  <option value="always">Siempre usar IDG</option>
                  <option value="ask">Preguntarme</option>
                  <option value="browser">Usar el navegador</option>
                </select>
              </label>
              <p>
                Preferencia guardada para la fase de captura. Actualmente no
                intercepta descargas.
              </p>
            </>
          ) : backend && section === "Colas y programación" ? (
            <p>
              La cola básica se inicia o detiene desde En cola. Edición avanzada
              y horarios: fase 06.
            </p>
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
export function FirstRunWizard({
  onClose,
  backend,
  preferences,
  savePreferences,
}: {
  onClose: () => void;
  backend?: DesktopApi;
  preferences?: AppPreferences;
  savePreferences?: (p: Partial<AppPreferences>) => Promise<void>;
}) {
  const [directory, setDirectory] = useState(preferences?.directory ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (backend && !directory)
      void backend
        .defaultFolder()
        .then(setDirectory)
        .catch((e) => setError(String(e)));
  }, [backend]);
  async function finish() {
    if (!savePreferences) return onClose();
    setBusy(true);
    try {
      if (!directory) throw Error("Elige una carpeta para continuar.");
      await savePreferences({
        directory,
        welcome_done: true,
        autopick_mode:
          auto === "Siempre usar IDG"
            ? "always"
            : auto === "Usar el navegador"
              ? "browser"
              : "ask",
      });
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  const [step, setStep] = useState(0);
  const [organize, setOrganize] = useState(false);
  const [auto, setAuto] = useState("Preguntarme");
  const names = ["Bienvenida", "Carpeta", "Navegadores", "AutoPick"];
  return (
    <Modal title="Primera configuración" onClose={onClose}>
      <p className="sample-note">
        {backend
          ? "Configuración guardada por el motor en este equipo."
          : "Vista de galería · no configura Windows ni el motor."}
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
              disabled={!backend || busy}
              value={directory}
              onChange={(e) => setDirectory(e.target.value)}
              placeholder="Descargas de Windows · no consultada"
            />
          </label>
          <button
            disabled={!backend || busy}
            onClick={() =>
              void backend
                ?.chooseFolder()
                .then((p) => {
                  if (p) setDirectory(p);
                })
                .catch((e) => setError(String(e)))
            }
          >
            Elegir carpeta…
          </button>
          <label className="check-field">
            <input
              type="checkbox"
              disabled={!!backend}
              checked={organize}
              onChange={(e) => setOrganize(e.target.checked)}
            />
            Organizar por tipo
          </label>
        </>
      ) : step === 2 ? (
        <>
          {backend && <BrowserStatus />}
          <p>
            {backend
              ? "La carga de la extensión se realiza siguiendo la guía de desarrollo; no se afirma su instalación desde este asistente."
              : "No se detectan instalaciones desde esta galería."}{" "}
            Detectado, instalado y conectado son estados distintos.
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
            elección {backend ? "guardada" : "de muestra"} no activa captura.
          </p>
        </>
      )}
      <footer className="dialog-actions">
        {error && <p role="alert">{error}</p>}
        {!backend && <button onClick={onClose}>Cerrar muestra</button>}
        <button disabled={step === 0} onClick={() => setStep(step - 1)}>
          Atrás
        </button>
        {step < 3 ? (
          <button className="primary" onClick={() => setStep(step + 1)}>
            Siguiente
          </button>
        ) : (
          <button
            disabled={busy}
            className="primary"
            onClick={() => void finish()}
          >
            {backend ? "Guardar configuración" : "Terminar vista previa"}
          </button>
        )}
      </footer>
    </Modal>
  );
}

function LimitsSettings() {
  const [limits, setLimits] = useState<ResourceLimits | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    void execute("get_resource_limits")
      .then((r) => {
        if (r.kind === "resource_limits") setLimits(r.limits);
      })
      .catch((e) => setError(String(e)));
  }, []);
  return (
    <>
      {error && <p role="alert">{error}</p>}
      {limits && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void execute({ set_resource_limits: { limits } })
              .then(() => setError("Límites guardados por el motor."))
              .catch((e) => setError(String(e)));
          }}
        >
          {(
            [
              ["max_downloads", "Descargas simultáneas", 8],
              ["global_requests", "Solicitudes globales", 32],
              ["origin_requests", "Solicitudes por origen", 32],
            ] as const
          ).map(([key, label, max]) => (
            <label className="field" key={key}>
              {label}
              <input
                type="number"
                min="1"
                max={max}
                value={limits[key]}
                onChange={(e) =>
                  setLimits({ ...limits, [key]: Number(e.target.value) })
                }
              />
            </label>
          ))}
          <label className="field">
            Límite global (KiB/s)
            <input
              type="number"
              min="1"
              max="4194303"
              value={
                limits.bytes_per_second === null
                  ? ""
                  : limits.bytes_per_second / 1024
              }
              onChange={(e) =>
                setLimits({
                  ...limits,
                  bytes_per_second: e.target.value
                    ? Number(e.target.value) * 1024
                    : null,
                })
              }
            />
          </label>
          <button>Guardar límites</button>
        </form>
      )}
    </>
  );
}
function BrowserStatus() {
  const [browsers, setBrowsers] = useState<[string, boolean][]>([]),
    [hosts, setHosts] = useState(0);
  useEffect(() => {
    let disposed = false,
      off: (() => void) | undefined;
    void invoke<[string, boolean][]>("detect_browsers").then((b) => {
      if (!disposed) setBrowsers(b);
    });
    void listen<ConnectionState>("runtime-state", (e) =>
      setHosts(e.payload.snapshot?.native_hosts ?? 0),
    ).then((fn) => {
      if (disposed) fn();
      else off = fn;
    });
    return () => {
      disposed = true;
      off?.();
    };
  }, []);
  return (
    <>
      <ul>
        {browsers.map(([name, detected]) => (
          <li key={name}>
            {name}:{" "}
            {detected
              ? "detectado en ubicación habitual"
              : "no detectado en ubicaciones habituales"}{" "}
            · extensión cargada: no comprobada aquí.
          </li>
        ))}
      </ul>
      <p>
        Conexiones reales de Native Messaging: {hosts}. Esta conexión no
        identifica por sí sola el navegador ni demuestra captura AutoPick.
      </p>
    </>
  );
}
