import type { DownloadSnapshot } from "../../../packages/shared-types/protocol";
// Presentation-only view model using the states in ARCHITECTURE. Not an IPC contract.
export type TransferState =
  | "Downloading"
  | "Paused"
  | "Deferred"
  | "Cancelled"
  | "Queued"
  | "Completed"
  | "Failed"
  | "Probing"
  | "Processing";
export type DownloadView = {
  id: string;
  name: string;
  state: TransferState;
  category: string;
  domain: string;
  date: string;
  total: number | bigint | null;
  received: number | bigint;
  snapshot?: DownloadSnapshot;
  speed: number | null;
  eta: string | null;
  samples: number[];
  resume:
    "Desconocida" | "No disponible" | "Disponible en la comprobación actual";
  missing?: boolean;
  error?: string;
};
export const stateLabels: Record<TransferState, string> = {
  Downloading: "Descargando",
  Paused: "Pausadas",
  Deferred: "Para después",
  Cancelled: "Canceladas",
  Queued: "En cola",
  Completed: "Completadas",
  Failed: "Fallidas",
  Probing: "Comprobando",
  Processing: "Procesando",
};
export type Filters = {
  query: string;
  view: string;
  site: string;
  after: string;
  size: string;
  status: string;
};
export function filterDownloads(rows: DownloadView[], f: Filters) {
  const q = f.query.trim().toLocaleLowerCase("es");
  return rows.filter(
    (r) =>
      (f.view === "Todas" ||
        f.view === stateLabels[r.state] ||
        f.view === r.category) &&
      (!q || `${r.name} ${r.domain}`.toLocaleLowerCase("es").includes(q)) &&
      (!f.site || r.domain.toLowerCase().includes(f.site.toLowerCase())) &&
      (!f.after || r.date >= f.after) &&
      (!f.status || stateLabels[r.state] === f.status) &&
      (f.size === "" ||
        (f.size === "unknown"
          ? r.total === null
          : r.total !== null &&
            (f.size === "large" ? r.total >= 1024 ** 3 : r.total < 1024 ** 3))),
  );
}
export function autoExpanded(count: number, availableHeight: number) {
  return count > 0 && count <= 3 && availableHeight >= count * 250;
}
export function formatBytes(value: number | bigint | null) {
  if (typeof value === "bigint") {
    const units = ["B", "KiB", "MiB", "GiB"];
    let unit = 1n,
      index = 0;
    while (value >= unit * 1024n && index < 3) {
      unit *= 1024n;
      index++;
    }
    const tenths = (value * 10n) / unit;
    return `${(tenths / 10n).toLocaleString("es")}${tenths % 10n ? "," + String(tenths % 10n) : ""} ${units[index]}`;
  }
  if (value === null) return "Tamaño desconocido";
  if (value === 0) return "0 B";
  const n = Math.min(3, Math.floor(Math.log(value) / Math.log(1024)));
  return `${(value / 1024 ** n).toLocaleString("es", { maximumFractionDigits: 1 })} ${["B", "KiB", "MiB", "GiB"][n]}`;
}
export function validateDraft(name: string, url: string) {
  const errors: { name?: string; url?: string } = {};
  if (
    !name.trim() ||
    /[<>:"/\\|?*\u0000-\u001f]/.test(name) ||
    /[. ]$/.test(name) ||
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name) ||
    name.length > 240
  )
    errors.name =
      "Escribe un nombre válido de Windows, sin rutas ni nombres reservados.";
  try {
    const u = new URL(url);
    if (
      !["https:", "http:", "ftp:", "ftps:"].includes(u.protocol) ||
      !u.hostname ||
      u.username ||
      u.password
    )
      throw Error();
  } catch {
    errors.url =
      "Introduce una URL HTTP, HTTPS, FTP o FTPS válida, sin credenciales incrustadas.";
  }
  return errors;
}
