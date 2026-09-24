import { useLibrarySearch, BulkControls, LibraryPreferences } from "./Library";
import type { DesktopApi } from "./desktop";
import { usePreferences } from "./desktop";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { Modal } from "./ui/Modal";
import type { DownloadSnapshot } from "../../../packages/shared-types/protocol";
import { useState, useRef, useEffect, type ReactNode } from "react";
import { Icon } from "./ui/Icon";
import { useAppearance, useViewMode, type Theme } from "./ui/appearance";
import { type DownloadView, type Filters, filterDownloads } from "./model";
import { DownloadList, supports, type RowAction } from "./DownloadList";
import { NewDownloadDialog } from "./Dialogs";
import { Settings, FirstRunWizard } from "./Settings";
import {
  QueueEditor,
  EnergyNotice,
  useOrganization,
  organize,
} from "./Organization";
import { RuleEditor } from "./Rules";
import { ImportDialog } from "./Import";
import { ClipboardNotice } from "./Clipboard";
export const states = [
  "Todas",
  "Descargando",
  "En cola",
  "Completadas",
  "Pausadas",
  "Fallidas",
  "Para después",
  "Canceladas",
];
export const categories = [
  "Videos",
  "Documentos",
  "Programas",
  "Comprimidos",
  "Otros",
];
const emptyFilters: Filters = {
  query: "",
  view: "Todas",
  site: "",
  after: "",
  size: "",
  status: "",
};
const noRows: DownloadView[] = [];
export function App({
  connection,
  backend,
  rows = noRows,
  galleryTools,
  previewState = "normal",
}: {
  connection: ReactNode;
  backend?: DesktopApi;
  rows?: DownloadView[];
  galleryTools?: ReactNode;
  previewState?: string;
}) {
  const { theme, setTheme: setLocalTheme } = useAppearance(!backend);
  const {
    preferences,
    save: savePreferences,
    failure: preferencesFailure,
  } = usePreferences(backend);
  const setTheme = (t: Theme) => {
    if (backend) void savePreferences({ theme: t }).catch(() => {});
    else setLocalTheme(t);
  };
  const [filters, setFilters] = useState(emptyFilters);
  const { state: organization } = useOrganization(Boolean(backend));
  const [queueEditor, setQueueEditor] = useState(false);
  const [ruleEditor, setRuleEditor] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [narrowWindow, setNarrowWindow] = useState(
    () => window.matchMedia("(max-width: 760px)").matches,
  );
  const menuButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const updateWidth = () => {
      setNarrowWindow(media.matches);
      if (!media.matches) setMobileMenuOpen(false);
    };
    media.addEventListener("change", updateWidth);
    return () => media.removeEventListener("change", updateWidth);
  }, []);
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector("dialog[open]")) {
        setMobileMenuOpen(false);
        menuButton.current?.focus();
      }
    };
    document.addEventListener("keydown", onEscape);
    document.getElementById("sidebar-nav")?.querySelector("button")?.focus();
    return () => document.removeEventListener("keydown", onEscape);
  }, [mobileMenuOpen]);
  const [selected, setSelected] = useState(new Set<string>());
  const { mode, setMode: setLocalMode } = useViewMode(!backend);
  const setMode = (view: string) => {
    if (backend) void savePreferences({ view }).catch(() => {});
    else setLocalMode(view);
  };
  useEffect(() => {
    if (preferences) {
      setLocalTheme(preferences.theme as Theme);
      setLocalMode(preferences.view);
    }
  }, [preferences, setLocalTheme, setLocalMode]);
  const [exitRequest, setExitRequest] = useState<{
    active: number;
    unsafe_resume: number;
    ask: boolean;
    unknown: boolean;
  } | null>(null);
  const [exiting, setExiting] = useState(false);
  async function exit() {
    setExiting(true);
    try {
      await invoke("exit_desktop");
    } catch (e) {
      setActionNotice(String(e));
      setExiting(false);
    }
  }
  useEffect(() => {
    if (!backend) return;
    let disposed = false;
    const offs: (() => void)[] = [];
    for (const task of [
      listen("desktop-launch", () => {
        void invoke("start_runtime")
          .then(() => invoke("connect_runtime"))
          .catch((e) => setActionNotice(String(e)));
      }),
      listen("desktop-new", () => setDialog("new")),
      listen<string>("desktop-drop", (e) => {
        if (document.querySelector("dialog[open]")) {
          setActionNotice(
            "Ya hay un diálogo abierto. Ciérralo antes de soltar otro enlace.",
          );
          return;
        }
        setDroppedUrl(e.payload);
        setDialog("new");
      }),
      listen<{
        active: number;
        unsafe_resume: number;
        ask: boolean;
        unknown: boolean;
      }>("desktop-exit-request", (e) => setExitRequest(e.payload)),
      listen<string>("desktop-notice", (e) => setActionNotice(e.payload)),
    ])
      void task.then((off) => {
        if (disposed) off();
        else offs.push(off);
      });
    return () => {
      disposed = true;
      offs.forEach((off) => off());
    };
  }, [backend]);
  const [expansions, setExpansions] = useState<Record<string, boolean>>({});
  const [dialog, setDialog] = useState<"new" | "settings" | null>(null);
  const [stats, setStats] = useState(false);
  const [droppedUrl, setDroppedUrl] = useState("");
  const [notifications, setNotifications] = useState<DownloadSnapshot[]>([]);
  useEffect(() => {
    if (backend && preferences)
      void invoke("set_drop_window", {
        enabled: preferences.drop_target,
      }).catch((e) => setActionNotice(String(e)));
  }, [backend, preferences?.drop_target]);
  useEffect(() => {
    if (!backend || !preferences) return;
    const completed = (event: Event) => {
      const job = (event as CustomEvent<DownloadSnapshot>).detail;
      if (
        (job.state === "completed" && preferences.notify_completed) ||
        (job.state === "failed" && preferences.notify_failed)
      ) {
        setNotifications((old) =>
          [...old.filter((n) => n.id !== job.id), job].slice(-10),
        );
        void invoke("notify_download", { jobId: job.id }).catch((e) =>
          setActionNotice(String(e)),
        );
      }
    };
    addEventListener("idg-job-finished", completed);
    return () => removeEventListener("idg-job-finished", completed);
  }, [backend, preferences]);
  useEffect(() => {
    if (backend && preferences)
      void invoke("set_mini_window", {
        enabled: preferences.mini_window,
      }).catch((e) => setActionNotice(String(e)));
  }, [backend, preferences?.mini_window]);
  const [actionNotice, setActionNotice] = useState("");
  const pendingActions = useRef(new Set<string>());
  async function action(id: string, command: RowAction) {
    if (command === "organize") {
      setSelected(new Set([id]));
      return;
    }
    if (!backend || pendingActions.current.has(id)) return;
    pendingActions.current.add(id);
    try {
      if (command === "folder") await backend.reveal(id);
      else await backend.action(id, command);
      setActionNotice(
        command === "folder"
          ? "Windows recibió la carpeta del trabajo."
          : "Solicitud aceptada. La fila muestra el estado confirmado por el motor.",
      );
    } catch (e) {
      setActionNotice(
        e instanceof Error ? e.message : "No se pudo completar la acción.",
      );
    } finally {
      pendingActions.current.delete(id);
    }
  }
  async function queue(running: boolean) {
    if (!backend) return;
    try {
      const p = await backend.preferences();
      await backend.savePreferences({ ...p, queue_running: running });
      setActionNotice(
        running
          ? "Cola en ejecución; respeta la capacidad del motor."
          : "Cola detenida; los trabajos ya activos continúan.",
      );
    } catch (e) {
      setActionNotice(String(e));
    }
  }
  const [page, setPage] = useState(0);
  const search = useRef<HTMLInputElement>(null);
  const filtersRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        e.key.toLowerCase() === "f" &&
        !document.querySelector("dialog[open]")
      ) {
        e.preventDefault();
        search.current?.focus();
      }
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, []);
  const update = (change: Partial<Filters>) => {
    setFilters({ ...filters, ...change });
    setPage(0);
  };
  const library = useLibrarySearch(Boolean(backend), filters, page, rows);
  const visible = backend
    ? rows.filter((r) => library.ids.includes(r.id))
    : filterDownloads(rows, filters);
  const total = backend ? library.total : visible.length;
  const pageRows = backend ? visible : visible.slice(page * 50, page * 50 + 50);
  const active =
    filters.query ||
    filters.view !== "Todas" ||
    filters.site ||
    filters.after ||
    filters.size ||
    filters.status;
  const toggle = (id: string) =>
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allSelected =
    pageRows.length > 0 && pageRows.every((r) => selected.has(r.id));
  return (
    <div className="app-frame">
      {galleryTools}
      <div
        className={
          "app-shell" +
          (collapsed ? " collapsed" : "") +
          (mobileMenuOpen ? " mobile-menu-open" : "")
        }
      >
        <button
          className="mobile-nav-backdrop"
          aria-label="Cerrar navegación"
          aria-hidden={!mobileMenuOpen}
          tabIndex={mobileMenuOpen ? 0 : -1}
          onClick={() => {
            setMobileMenuOpen(false);
            menuButton.current?.focus();
          }}
        />
        <aside
          className="sidebar"
          inert={narrowWindow && !mobileMenuOpen}
          onKeyDown={(event) => {
            if (!mobileMenuOpen || event.key !== "Tab") return;
            const controls = Array.from(
              event.currentTarget.querySelectorAll<HTMLElement>(
                "button:not([disabled]), select:not([disabled])",
              ),
            );
            const first = controls[0],
              last = controls.at(-1);
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first?.focus();
            }
          }}
        >
          <div className="brand">
            <span className="brand-mark">
              <Icon name="download" />
            </span>
            <strong>IDG</strong>
            <span className="muted brand-caption">Download Genious</span>
          </div>
          <button
            className="mobile-nav-close"
            aria-label="Cerrar navegación"
            onClick={() => {
              setMobileMenuOpen(false);
              menuButton.current?.focus();
            }}
          >
            <Icon name="close" />
          </button>
          <nav
            id="sidebar-nav"
            aria-label="Descargas"
            onClick={() => {
              if (narrowWindow) menuButton.current?.focus();
              setMobileMenuOpen(false);
            }}
          >
            {backend && (
              <button onClick={() => update({ view: "Ocultas" })}>
                Ocultas
              </button>
            )}
            <small>DESCARGAS</small>
            {states.map((s, i) => (
              <button
                key={s}
                data-view-state={s}
                aria-current={filters.view === s ? "page" : undefined}
                onClick={() => update({ view: s })}
              >
                <Icon
                  name={
                    [
                      "folder",
                      "download",
                      "clock",
                      "check",
                      "pause",
                      "error",
                      "clock",
                      "error",
                    ][i]
                  }
                />
                <span>{s}</span>
              </button>
            ))}
            <small>CATEGORÍAS</small>
            {(organization?.categories ?? categories).map((s, i) => (
              <button
                key={s}
                aria-current={filters.view === s ? "page" : undefined}
                onClick={() => update({ view: s })}
              >
                <Icon
                  name={
                    ["video", "file", "code", "box", "folder"][i] ?? "folder"
                  }
                />
                <span>{s}</span>
              </button>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <button
              onClick={() => {
                if (narrowWindow) menuButton.current?.focus();
                setMobileMenuOpen(false);
                setDialog("settings");
              }}
            >
              <Icon name="settings" />
              <span>Configuración</span>
            </button>
            {(backend ? organization?.library.statistics_visible : stats) && (
              <button
                onClick={() => {
                  if (narrowWindow) {
                    menuButton.current?.focus();
                    setMobileMenuOpen(false);
                  }
                  update({ view: "Estadísticas" });
                }}
              >
                Estadísticas
              </button>
            )}
            <label>
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
            <small className="muted">Desarrollo · fase 06</small>
          </div>
        </aside>
        <div className="workspace">
          <header className="toolbar">
            <button
              ref={menuButton}
              aria-label={
                narrowWindow
                  ? mobileMenuOpen
                    ? "Cerrar navegación"
                    : "Mostrar navegación"
                  : collapsed
                    ? "Mostrar sidebar"
                    : "Contraer sidebar"
              }
              aria-controls="sidebar-nav"
              aria-expanded={narrowWindow ? mobileMenuOpen : !collapsed}
              onClick={() => {
                if (narrowWindow) setMobileMenuOpen(!mobileMenuOpen);
                else setCollapsed(!collapsed);
              }}
            >
              <Icon name="menu" />
            </button>
            <label className="search">
              <Icon name="search" />
              <input
                ref={search}
                type="search"
                placeholder="Buscar descargas…"
                aria-label="Buscar descargas"
                value={filters.query}
                onChange={(e) => update({ query: e.target.value })}
              />
            </label>
            <details
              className={
                "filters" +
                (filters.status || filters.site || filters.after || filters.size
                  ? " has-filters"
                  : "")
              }
              ref={filtersRef}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  filtersRef.current!.open = false;
                  filtersRef.current?.querySelector("summary")?.focus();
                }
              }}
            >
              <summary>
                <Icon name="filter" />
                Filtros
              </summary>
              <div className="filter-popover">
                <label className="field">
                  Estado
                  <select
                    aria-label="Estado"
                    value={filters.status}
                    onChange={(e) => update({ status: e.target.value })}
                  >
                    <option value="">Todos</option>
                    {states.slice(1).map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Sitio
                  <input
                    value={filters.site}
                    onChange={(e) => update({ site: e.target.value })}
                  />
                </label>
                <label className="field">
                  Desde fecha
                  <input
                    type="date"
                    value={filters.after}
                    onChange={(e) => update({ after: e.target.value })}
                  />
                </label>
                <label className="field">
                  Tamaño
                  <select
                    aria-label="Tamaño"
                    value={filters.size}
                    onChange={(e) => update({ size: e.target.value })}
                  >
                    <option value="">Cualquiera</option>
                    <option value="small">Menos de 1 GiB</option>
                    <option value="large">1 GiB o más</option>
                    <option value="unknown">Desconocido</option>
                  </select>
                </label>
                <button
                  onClick={() => {
                    filtersRef.current!.open = false;
                    filtersRef.current?.querySelector("summary")?.focus();
                  }}
                >
                  Cerrar filtros
                </button>
              </div>
            </details>
            <button className="primary" onClick={() => setDialog("new")}>
              <Icon name="plus" />
              Nueva descarga
            </button>
            {backend && (
              <button
                onClick={() => {
                  setImportText("");
                  setImportOpen(true);
                }}
              >
                Importar enlaces
              </button>
            )}
          </header>
          <main>
            {backend && preferences?.drop_target && (
              <button
                onClick={() =>
                  void invoke("set_drop_window", { enabled: true }).catch((e) =>
                    setActionNotice(String(e)),
                  )
                }
              >
                Mostrar zona flotante de enlaces
              </button>
            )}
            {notifications.length > 0 && (
              <section aria-label="Notificaciones" aria-live="polite">
                {notifications.map((job) => (
                  <div key={job.id}>
                    <strong>{job.name}</strong>
                    <span>
                      {job.state === "completed"
                        ? " · Descarga completada"
                        : " · Error de descarga"}
                    </span>
                    {job.message && <p>{job.message}</p>}
                    <button onClick={() => void action(job.id, "folder")}>
                      Abrir carpeta
                    </button>
                    <button
                      onClick={() => {
                        setFilters({ ...emptyFilters, query: job.name });
                        setPage(0);
                        setExpansions((old) => ({ ...old, [job.id]: true }));
                      }}
                    >
                      Ver trabajo
                    </button>
                    <button
                      onClick={() =>
                        setNotifications((old) =>
                          old.filter((n) => n.id !== job.id),
                        )
                      }
                    >
                      Descartar aviso
                    </button>
                  </div>
                ))}
              </section>
            )}
            {preferencesFailure && <p role="alert">{preferencesFailure}</p>}
            {actionNotice && <p role="status">{actionNotice}</p>}
            {library.error && <p role="alert">{library.error}</p>}
            {library.pending && (
              <p role="status">Buscando en el historial del motor…</p>
            )}
            {backend && <EnergyNotice />}
            {backend && (
              <ClipboardNotice
                enabled={organization?.library.clipboard ?? false}
                onReview={(text) => {
                  setImportText(text);
                  setImportOpen(true);
                }}
              />
            )}
            {backend && filters.view === "En cola" && (
              <div className="queue-toolbar" aria-label="Acciones de cola">
                <button onClick={() => void queue(true)}>Iniciar cola</button>
                <button onClick={() => void queue(false)}>Detener cola</button>
                <button onClick={() => setQueueEditor(true)}>
                  Gestionar colas
                </button>
                <button onClick={() => setRuleEditor(true)}>
                  Gestionar reglas
                </button>
              </div>
            )}
            <div className="view-heading">
              {queueEditor && (
                <QueueEditor onClose={() => setQueueEditor(false)} />
              )}
              {ruleEditor && (
                <RuleEditor onClose={() => setRuleEditor(false)} />
              )}
              {importOpen && backend && (
                <ImportDialog
                  backend={backend}
                  initialText={importText}
                  onClose={() => {
                    setImportOpen(false);
                    setImportText("");
                  }}
                />
              )}
              <div>
                <p className="eyebrow">TU BIBLIOTECA</p>
                <h1>
                  {filters.view === "Todas"
                    ? "Todas las descargas"
                    : filters.view}
                </h1>
                <p className="muted count">
                  {total} {total === 1 ? "archivo" : "archivos"}
                  {galleryTools ? " de ejemplo" : ""}
                </p>
              </div>
              <label className="view-mode">
                Vista
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
            </div>
            {active && (
              <div className="active-filters" aria-label="Filtros activos">
                <span>
                  {[
                    filters.view !== "Todas" ? filters.view : "",
                    filters.query && `Texto: ${filters.query}`,
                    filters.site && `Sitio: ${filters.site}`,
                    filters.after && `Desde: ${filters.after}`,
                    filters.size && `Tamaño: ${filters.size}`,
                    filters.status,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                <button
                  onClick={() => {
                    setFilters(emptyFilters);
                    setPage(0);
                  }}
                >
                  Limpiar filtros
                </button>
              </div>
            )}
            {selected.size > 0 && (
              <section
                className="selection-toolbar"
                aria-label="Selección múltiple"
              >
                <strong>{selected.size} seleccionados</strong>
                <small>
                  {visible.filter((r) => selected.has(r.id)).length} visibles
                </small>
                {backend && <BulkControls ids={[...selected]} rows={rows} />}
                <button onClick={() => setSelected(new Set())}>
                  Quitar selección
                </button>
                <small id="batch-pending">
                  Solo se aplican a estados compatibles. La selección se
                  conserva al cambiar filtros.
                </small>
              </section>
            )}
            {filters.view === "Estadísticas" ? (
              <section className="empty">
                <Icon name="file" size={28} />
                <h2>Estadísticas opcionales</h2>
                {backend ? (
                  <LibraryPreferences />
                ) : (
                  <p>Sin recopilación en la galería.</p>
                )}
              </section>
            ) : previewState === "loading" ? (
              <section className="empty" aria-busy="true" role="status">
                <h2>Cargando metadatos…</h2>
                <p>
                  Muestra estática de galería. No hay ninguna solicitud en
                  curso.
                </p>
              </section>
            ) : previewState === "error" || previewState === "offline" ? (
              <section className="empty" role="alert">
                <Icon name="error" size={28} />
                <h2>
                  {previewState === "offline"
                    ? "Conexión no disponible"
                    : "No se pudieron leer los datos"}
                </h2>
                <p>
                  Muestra de error. Los datos existentes deben conservarse y la
                  causa no debe inventarse.
                </p>
              </section>
            ) : visible.length ? (
              <>
                <div className="list-heading">
                  <label>
                    <input
                      type="checkbox"
                      aria-label="Seleccionar todos los visibles"
                      checked={allSelected}
                      ref={(node) => {
                        if (node)
                          node.indeterminate =
                            !allSelected &&
                            pageRows.some((r) => selected.has(r.id));
                      }}
                      onChange={() =>
                        setSelected((previous) => {
                          const next = new Set(previous);
                          pageRows.forEach((r) =>
                            allSelected ? next.delete(r.id) : next.add(r.id),
                          );
                          return next;
                        })
                      }
                    />
                    Archivo
                  </label>
                  <span>Progreso</span>
                  <span>Actividad</span>
                  <span>Velocidad / restante</span>
                </div>
                <DownloadList
                  rows={pageRows}
                  selected={selected}
                  onSelect={toggle}
                  viewMode={mode}
                  overrides={expansions}
                  setOverrides={setExpansions}
                  onAction={backend ? action : undefined}
                />
                {total > 50 && (
                  <div className="pagination">
                    <button
                      disabled={page === 0}
                      onClick={() => setPage(page - 1)}
                    >
                      Anterior
                    </button>
                    <span>Página {page + 1}</span>
                    <button
                      disabled={(page + 1) * 50 >= total}
                      onClick={() => setPage(page + 1)}
                    >
                      Siguiente
                    </button>
                  </div>
                )}
              </>
            ) : (
              <section className="empty">
                <span className="empty-icon">
                  <Icon name={active ? "search" : "download"} size={26} />
                </span>
                <h2>
                  {active ? "No hay resultados" : "Todo listo para empezar"}
                </h2>
                <p>
                  {active
                    ? "Prueba otra búsqueda o limpia los filtros."
                    : "Tu lista de descargas aparecerá aquí."}
                </p>
                <p className="muted">
                  {galleryTools
                    ? "Galería aislada. Selecciona una cantidad de muestras arriba."
                    : "Añade una URL para comenzar. El motor mostrará aquí su progreso real."}
                </p>
                {!active && (
                  <button onClick={() => setDialog("new")}>
                    Preparar una descarga
                  </button>
                )}
              </section>
            )}
          </main>
          {connection}
        </div>
      </div>
      {dialog === "new" && (
        <NewDownloadDialog
          backend={backend}
          initialUrl={droppedUrl}
          onClose={() => {
            setDialog(null);
            setDroppedUrl("");
          }}
        />
      )}{" "}
      {dialog === "settings" && (
        <Settings
          onQueues={() => {
            setDialog(null);
            setQueueEditor(true);
          }}
          onRules={() => {
            setDialog(null);
            setRuleEditor(true);
          }}
          backend={backend}
          preferences={preferences}
          savePreferences={savePreferences}
          onClose={() => setDialog(null)}
          theme={theme}
          setTheme={setTheme}
          stats={
            backend
              ? (organization?.library.statistics_visible ?? false)
              : stats
          }
          setStats={(value) => {
            if (backend && organization)
              void organize({
                action: "set_library_settings",
                settings: {
                  ...organization.library,
                  statistics_visible: value,
                },
              }).catch((e) => setActionNotice(String(e)));
            else setStats(value);
          }}
          mode={mode}
          setMode={setMode}
        />
      )}
      {backend && preferences && !preferences.welcome_done && (
        <FirstRunWizard
          backend={backend}
          preferences={preferences}
          savePreferences={savePreferences}
          onClose={() => {}}
        />
      )}
      {exitRequest && (
        <Modal
          title="Salir completamente"
          onClose={() => {
            if (!exiting) setExitRequest(null);
          }}
        >
          <p>
            {exitRequest.unknown
              ? "Estado de trabajos no disponible."
              : `${exitRequest.active} trabajos activos.`}{" "}
            Se esperará a guardar sus checkpoints.
          </p>
          {exitRequest.unsafe_resume > 0 && (
            <p role="alert">
              {exitRequest.unsafe_resume} trabajos no tienen recuperación
              comprobada; podrían necesitar un inicio desde cero con tu
              autorización. Se conservarán sus parciales.
            </p>
          )}
          <p>Salir detiene el motor; ocultar conserva las descargas.</p>
          <footer className="dialog-actions">
            <button disabled={exiting} onClick={() => setExitRequest(null)}>
              Cancelar
            </button>
            <button
              disabled={exiting}
              onClick={() => {
                setExitRequest(null);
                void invoke("hide_desktop");
              }}
            >
              Ocultar en bandeja
            </button>
            <button disabled={exiting} onClick={() => void exit()}>
              {exiting ? "Guardando y cerrando…" : "Salir completamente"}
            </button>
          </footer>
        </Modal>
      )}
    </div>
  );
}
