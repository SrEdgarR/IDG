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
export type DownloadAuthDraft = {
  username: string;
  password: string;
  headers: { name: string; value: string }[];
};
export type DownloadProxyDraft = {
  mode: "inherit" | "direct" | "environment" | "explicit";
  url: string;
};

export function validateDraft(
  name: string,
  url: string,
  auth: DownloadAuthDraft = { username: "", password: "", headers: [] },
  allowCleartextFtp = false,
  proxy: DownloadProxyDraft = { mode: "inherit", url: "" },
) {
  const errors: {
    name?: string;
    url?: string;
    auth?: string;
    headers?: string;
    cleartextFtp?: string;
    proxy?: string;
  } = {};
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
      u.password ||
      ((u.protocol === "ftp:" || u.protocol === "ftps:") && /[?#]/.test(url))
    )
      throw Error();
    if (u.protocol === "ftp:" && !allowCleartextFtp)
      errors.cleartextFtp = "Confirma que aceptas una conexión FTP sin cifrar.";
  } catch {
    errors.url =
      "Introduce una URL HTTP, HTTPS, FTP o FTPS válida, sin credenciales incrustadas.";
  }
  if (
    (auth.username !== "" &&
      (!auth.username.trim() ||
        new TextEncoder().encode(auth.username).length > 512 ||
        /\p{Cc}/u.test(auth.username))) ||
    new TextEncoder().encode(auth.password).length > 2048 ||
    /\p{Cc}/u.test(auth.password) ||
    (auth.password !== "" && auth.username === "")
  )
    errors.auth = "Revisa el usuario y la contraseña; no se aceptan controles ni valores fuera del límite.";

  const headers = auth.headers.filter((header) => header.name || header.value);
  let protocol = "";
  try {
    protocol = new URL(url).protocol;
  } catch {
    // The URL error above is the relevant message.
  }
  const reservedHeaders = new Set([
    "authorization",
    "connection",
    "content-length",
    "cookie",
    "host",
    "if-range",
    "proxy-authorization",
    "range",
    "referer",
    "transfer-encoding",
    "accept-encoding",
  ]);
  if (
    headers.length > 32 ||
    headers.some((header) => {
      const name = header.name.toLowerCase();
      return (
        !/^[!#$%&'*+.^_`|~0-9a-z-]+$/i.test(header.name) ||
        new TextEncoder().encode(header.name).length > 256 ||
        new TextEncoder().encode(header.value).length > 8192 ||
        /\p{Cc}/u.test(header.value) ||
        reservedHeaders.has(name) ||
        !header.name ||
        !header.value
      );
    }) ||
    ((protocol === "ftp:" || protocol === "ftps:") && headers.length > 0)
  )
    errors.headers =
      protocol === "ftp:" || protocol === "ftps:"
        ? "Las cabeceras personalizadas no están disponibles con FTP/FTPS."
        : "Revisa las cabeceras: hay un campo incompleto, reservado o fuera de los límites permitidos.";
  if ((protocol === "ftp:" || protocol === "ftps:") && proxy.mode !== "inherit") {
    errors.proxy = "FTP/FTPS no admite una política de proxy por descarga.";
  } else if (proxy.mode === "explicit") {
    try {
      const u = new URL(proxy.url);
      const authority = proxy.url.slice(proxy.url.indexOf("://") + 3).split(/[/?#]/, 1)[0];
      const remainder = proxy.url.slice(proxy.url.indexOf("://") + 3 + authority.length);
      const portStart = authority.startsWith("[")
        ? authority.indexOf("]:") + 2
        : authority.lastIndexOf(":") + 1;
      const port = Number(authority.slice(portStart));
      const hasPort = authority.startsWith("[")
        ? /^\[[^\]]+\]:\d+$/.test(authority)
        : /:\d+$/.test(authority);
      if (
        !["http:", "https:", "socks5:", "socks5h:"].includes(u.protocol) ||
        !u.hostname ||
        !hasPort ||
        port < 1 ||
        port > 65535 ||
        authority.includes("@") ||
        u.username ||
        u.password ||
        remainder !== "" ||
        /\p{Cc}/u.test(proxy.url)
      )
        throw Error();
    } catch {
      errors.proxy =
        "Introduce un proxy HTTP, HTTPS, SOCKS5 o SOCKS5H con host y puerto, sin credenciales ni ruta.";
    }
  }
  return errors;
}
