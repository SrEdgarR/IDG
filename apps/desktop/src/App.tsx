import { useState, useRef, useEffect, type ReactNode } from "react";
import { Icon } from "./ui/Icon";
import { useAppearance, useViewMode, type Theme } from "./ui/appearance";
import { type DownloadView, type Filters, filterDownloads } from "./model";
import { DownloadList } from "./DownloadList";
import { NewDownloadDialog } from "./Dialogs";
import { Settings } from "./Settings";
export const states = [
  "Todas",
  "Descargando",
  "En cola",
  "Completadas",
  "Pausadas",
  "Fallidas",
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
  rows = noRows,
  galleryTools,
  previewState = "normal",
}: {
  connection: ReactNode;
  rows?: DownloadView[];
  galleryTools?: ReactNode;
  previewState?: string;
}) {
  const { theme, setTheme } = useAppearance();
  const [filters, setFilters] = useState(emptyFilters);
  const [collapsed, setCollapsed] = useState(false);
  const [selected, setSelected] = useState(new Set<string>());
  const { mode, setMode } = useViewMode();
  const [expansions, setExpansions] = useState<Record<string, boolean>>({});
  const [dialog, setDialog] = useState<"new" | "settings" | null>(null);
  const [stats, setStats] = useState(false);
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
  const visible = filterDownloads(rows, filters);
  const pageRows = visible.slice(page * 50, page * 50 + 50);
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
      <div className={"app-shell" + (collapsed ? " collapsed" : "")}>
        <aside className="sidebar">
          <div className="brand">
            <span className="brand-mark">
              <Icon name="download" />
            </span>
            <strong>IDG</strong>
            <span className="muted brand-caption">Download Genious</span>
          </div>
          <nav aria-label="Descargas">
            <small>DESCARGAS</small>
            {states.map((s, i) => (
              <button
                key={s}
                aria-current={filters.view === s ? "page" : undefined}
                onClick={() => update({ view: s })}
              >
                <Icon
                  name={
                    ["folder", "download", "clock", "check", "pause", "error"][
                      i
                    ]
                  }
                />
                <span>{s}</span>
              </button>
            ))}
            <small>CATEGORÍAS</small>
            {categories.map((s, i) => (
              <button
                key={s}
                aria-current={filters.view === s ? "page" : undefined}
                onClick={() => update({ view: s })}
              >
                <Icon name={["video", "file", "code", "box", "folder"][i]} />
                <span>{s}</span>
              </button>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <button onClick={() => setDialog("settings")}>
              <Icon name="settings" />
              <span>Configuración</span>
            </button>
            {stats && (
              <button onClick={() => update({ view: "Estadísticas" })}>
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
            <small className="muted">Desarrollo · fase 02</small>
          </div>
        </aside>
        <div className="workspace">
          <header className="toolbar">
            <button
              aria-label={collapsed ? "Mostrar sidebar" : "Contraer sidebar"}
              onClick={() => setCollapsed(!collapsed)}
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
              className="filters"
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
          </header>
          <main>
            <div className="view-heading">
              <div>
                <p className="eyebrow">TU BIBLIOTECA</p>
                <h1>
                  {filters.view === "Todas"
                    ? "Todas las descargas"
                    : filters.view}
                </h1>
                <p className="muted count">
                  {visible.length}{" "}
                  {visible.length === 1 ? "archivo" : "archivos"}
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
                {[
                  "Pausar",
                  "Reanudar",
                  "Reintentar",
                  "Mover a cola",
                  "Cambiar categoría",
                  "Quitar del historial",
                ].map((t) => (
                  <button key={t} disabled aria-describedby="batch-pending">
                    {t}
                  </button>
                ))}
                <button onClick={() => setSelected(new Set())}>
                  Quitar selección
                </button>
                <small id="batch-pending">
                  Acciones reales pendientes de backend · fases 05/06.
                </small>
              </section>
            )}
            {filters.view === "Estadísticas" ? (
              <section className="empty">
                <Icon name="file" size={28} />
                <h2>Estadísticas opcionales</h2>
                <p>
                  No hay recopilación ni métricas disponibles. Integración
                  prevista en fase 06.
                </p>
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
                />
                {visible.length > 50 && (
                  <div className="pagination">
                    <button
                      disabled={page === 0}
                      onClick={() => setPage(page - 1)}
                    >
                      Anterior
                    </button>
                    <span>Página {page + 1}</span>
                    <button
                      disabled={(page + 1) * 50 >= visible.length}
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
                    : "El motor de descargas todavía no está disponible."}
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
        <NewDownloadDialog onClose={() => setDialog(null)} />
      )}{" "}
      {dialog === "settings" && (
        <Settings
          onClose={() => setDialog(null)}
          theme={theme}
          setTheme={setTheme}
          stats={stats}
          setStats={setStats}
          mode={mode}
          setMode={setMode}
        />
      )}
    </div>
  );
}
