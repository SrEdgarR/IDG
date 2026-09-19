import type { DownloadView, TransferState } from "../model";
// GALLERY_ONLY_FIXTURE: this module is reachable only from gallery.html.
const names = [
  "Paisajes del altiplano.mp4",
  "Guía de viaje.pdf",
  "Herramientas de desarrollo.zip",
  "Editor de imágenes.exe",
  "Notas del proyecto.txt",
];
const categories = [
  "Videos",
  "Documentos",
  "Comprimidos",
  "Programas",
  "Otros",
];
const states: TransferState[] = [
  "Downloading",
  "Completed",
  "Paused",
  "Queued",
  "Failed",
  "Processing",
  "Probing",
];
export function examples(count: number): DownloadView[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `sample-${i}`,
    name: `${i > 4 ? `${i + 1} · ` : ""}${names[i % 5]}`,
    category: categories[i % 5],
    state: states[i % 7],
    domain: "archivos.example.org",
    date: `2026-09-${String(19 - (i % 12)).padStart(2, "0")}`,
    total: i === 6 ? null : Math.round(((i % 5) + 1) * 612 * 1024 ** 2),
    received: Math.round(
      ((i % 5) + 1) * 612 * 1024 ** 2 * (i % 7 === 1 ? 1 : 0.38),
    ),
    speed: i % 7 === 0 ? 8.2 * 1024 ** 2 : null,
    eta: i % 7 === 0 ? "2 min 18 s" : null,
    samples: i % 7 === 0 ? [2, 3, 3, 4, 3, 5, 4, 7, 6, 7, 6, 8, 7, 8] : [],
    resume:
      i % 3 === 0
        ? "Disponible en la comprobación actual"
        : i % 3 === 1
          ? "Desconocida"
          : "No disponible",
    missing: i === 8,
    error:
      i % 7 === 4
        ? "Enlace caducado. Se necesita una nueva URL autorizada."
        : undefined,
  }));
}
