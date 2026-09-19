import {
  useState,
  useEffect,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  type DownloadView,
  formatBytes,
  stateLabels,
  autoExpanded,
} from "./model";
import { Icon } from "./ui/Icon";
import { ConfirmDialog } from "./Dialogs";
export function Sparkline({ samples }: { samples: number[] }) {
  const bounded = samples.slice(-60);
  if (bounded.length < 2)
    return (
      <span className="sparkline muted" aria-label="Sin muestras de velocidad">
        —
      </span>
    );
  const max = Math.max(...bounded, 1);
  return (
    <svg
      className="sparkline"
      viewBox="0 0 84 24"
      aria-label="Gráfica de muestras de velocidad de ejemplo"
      role="img"
    >
      <polyline
        points={bounded
          .map(
            (n, i) =>
              `${(i * 84) / (bounded.length - 1)},${22 - (n / max) * 20}`,
          )
          .join(" ")}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}
function RowMenu({
  row,
  onDelete,
}: {
  row: DownloadView;
  onDelete: () => void;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node))
        ref.current?.removeAttribute("open");
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  return (
    <details
      ref={ref}
      className="row-menu"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          ref.current!.open = false;
          ref.current?.querySelector("summary")?.focus();
        }
      }}
    >
      <summary aria-label={`Acciones de ${row.name}`}>
        <Icon name="more" />
      </summary>
      <div
        className="action-menu"
        role="group"
        aria-label="Acciones pendientes de integración"
      >
        <small>Motor de descargas pendiente</small>
        {[
          "Pausar",
          "Reanudar",
          "Cancelar",
          "Reintentar",
          "Abrir archivo",
          "Abrir carpeta",
          "Copiar ruta",
          "Prioridad",
          "Mover a cola",
          "Cambiar categoría",
          "Quitar del historial",
          ...(row.missing ? ["Localizar archivo", "Descargar de nuevo"] : []),
        ].map((t) => (
          <button key={t} disabled title="Requiere backend; fases 05–12">
            {t}
          </button>
        ))}
        <button
          className="danger"
          onClick={() => {
            ref.current!.open = false;
            ref.current?.querySelector("summary")?.focus();
            onDelete();
          }}
        >
          Eliminar del disco…
        </button>
      </div>
    </details>
  );
}
export function DownloadList({
  rows,
  selected,
  onSelect,
  viewMode,
  overrides,
  setOverrides,
}: {
  rows: DownloadView[];
  selected: Set<string>;
  onSelect: (id: string) => void;
  viewMode: string;
  overrides: Record<string, boolean>;
  setOverrides: Dispatch<SetStateAction<Record<string, boolean>>>;
}) {
  const [height, setHeight] = useState(() => innerHeight - 300);
  const [deleting, setDeleting] = useState<DownloadView | null>(null);
  useEffect(() => {
    const resize = () => setHeight(innerHeight - 300);
    addEventListener("resize", resize);
    return () => removeEventListener("resize", resize);
  }, []);
  const automatic = autoExpanded(rows.length, height);
  return (
    <>
      <ul className="download-list">
        {rows.map((row) => {
          const expanded =
            overrides[row.id] ??
            (viewMode === "Expandida" ||
              (viewMode === "Automática" && automatic));
          const percentage =
            row.total === null
              ? null
              : Math.min(100, (row.received / Math.max(1, row.total)) * 100);
          return (
            <li
              key={row.id}
              className={
                "download-row" + (selected.has(row.id) ? " selected" : "")
              }
              data-row-id={row.id}
            >
              <div className="row-main">
                <input
                  type="checkbox"
                  aria-label={`Seleccionar ${row.name}`}
                  checked={selected.has(row.id)}
                  onChange={() => onSelect(row.id)}
                />
                <span className="file-icon">
                  <Icon
                    name={row.category === "Videos" ? "video" : "file"}
                    size={22}
                  />
                </span>
                <button
                  className="row-title"
                  aria-expanded={expanded}
                  aria-controls={`details-${row.id}`}
                  onClick={() =>
                    setOverrides({ ...overrides, [row.id]: !expanded })
                  }
                >
                  <span
                    className={row.missing ? "filename missing" : "filename"}
                    title={row.name}
                  >
                    {row.name}
                  </span>
                  <span className="row-subtitle">
                    {row.domain} <span>· {stateLabels[row.state]}</span>
                  </span>
                </button>
                <div className="row-progress">
                  <span>
                    {percentage === null
                      ? "Tamaño desconocido"
                      : `${Math.floor(percentage)} %`}
                  </span>
                  {percentage !== null && (
                    <progress
                      aria-label={`Progreso de ${row.name}`}
                      max={100}
                      value={percentage}
                    />
                  )}
                  <small>
                    {formatBytes(row.received)}
                    {row.total !== null ? ` / ${formatBytes(row.total)}` : ""}
                  </small>
                </div>
                <Sparkline samples={row.samples} />
                <span className="row-speed">
                  {row.speed === null ? "—" : `${formatBytes(row.speed)}/s`}
                  <small>{row.eta ?? "Tiempo desconocido"}</small>
                </span>
                <button
                  className="row-action"
                  aria-label={`${row.state === "Downloading" ? "Pausar" : row.state === "Completed" ? "Abrir carpeta" : row.state === "Failed" ? "Reintentar" : row.state === "Paused" ? "Reanudar" : "Iniciar"} ${row.name}`}
                  title="Motor de descargas pendiente · fase 05"
                  disabled
                >
                  <Icon
                    name={
                      row.state === "Downloading"
                        ? "pause"
                        : row.state === "Completed"
                          ? "folder"
                          : "download"
                    }
                  />
                </button>
                <RowMenu row={row} onDelete={() => setDeleting(row)} />
              </div>
              {expanded && (
                <section
                  id={`details-${row.id}`}
                  className="row-details"
                  aria-label={`Detalles de ${row.name}`}
                >
                  <dl className="metadata">
                    <div>
                      <dt>Categoría</dt>
                      <dd>{row.category}</dd>
                    </div>
                    <div>
                      <dt>Fecha</dt>
                      <dd>{row.date}</dd>
                    </div>
                    <div>
                      <dt>Reanudabilidad</dt>
                      <dd>{row.resume}</dd>
                    </div>
                    <div>
                      <dt>Velocidad / restante</dt>
                      <dd>
                        {row.speed === null
                          ? "Sin medidas"
                          : `${formatBytes(row.speed)}/s`}{" "}
                        · {row.eta ?? "Desconocido"}
                      </dd>
                    </div>
                  </dl>
                  {row.error && <p className="error-text">{row.error}</p>}
                  {row.missing && (
                    <p className="error-text">
                      No encontrado en su ubicación. No se puede afirmar que se
                      haya eliminado.
                    </p>
                  )}
                  <details>
                    <summary>Detalles técnicos</summary>
                    <p>
                      Origen público: {row.domain} · Prioridad: Normal ·
                      Concurrencia: no comprobada.
                    </p>
                    <p className="muted">
                      Muestras estáticas de galería; sin cabeceras privadas,
                      cookies ni logs del usuario.
                    </p>
                  </details>
                </section>
              )}
            </li>
          );
        })}
      </ul>
      {deleting && (
        <ConfirmDialog name={deleting.name} onClose={() => setDeleting(null)} />
      )}
    </>
  );
}
