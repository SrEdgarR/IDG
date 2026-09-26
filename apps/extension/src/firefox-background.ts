import type { CaptureProposal, Payload } from "../../../packages/shared-types/protocol";
import { request } from "./bridge";
import { getBrowserApi, getMenusApi } from "./browser-api";

const api = getBrowserApi();
const menus = getMenusApi();
const menuId = "idg-direct-link";
const activeRequests = new Set<string>();

export function directLinkFromUrl(value: unknown): Omit<CaptureProposal, "id" | "source"> | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    value.includes("?") ||
    value.includes("#")
  ) return null;

  const encodedName = url.pathname.split("/").at(-1) ?? "";
  let name: string;
  try {
    name = decodeURIComponent(encodedName);
  } catch {
    return null;
  }
  if (
    !name ||
    name.length > 240 ||
    name === "." ||
    name === ".." ||
    /[\\/<>:"|?*\u0000-\u001f]/.test(name)
  ) return null;
  return { url: value, name };
}

const pause = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

async function startAccepted(id: string, payload: Payload) {
  if (payload.kind !== "capture_status") throw new Error("IDG devolvió una respuesta incompatible.");
  if (payload.decision === "rejected") throw new Error("IDG rechazó el enlace.");
  if (payload.decision === "pending") await request("open_desktop");

  for (let attempt = 0; attempt < 220; attempt++) {
    const status = payload.decision === "accepted"
      ? payload
      : await request({ get_capture_status: { capture_id: id } });
    if (status.kind !== "capture_status") throw new Error("IDG devolvió una respuesta incompatible.");
    if (status.decision === "rejected") throw new Error("La solicitud se canceló en IDG.");
    if (status.decision === "accepted") {
      const started = await request({ start_capture: { capture_id: id } });
      if (started.kind !== "download") throw new Error("IDG no inició la descarga.");
      return;
    }
    await pause(500);
  }
  throw new Error("IDG no confirmó la solicitud a tiempo. Revisa la aplicación antes de repetirla.");
}

export async function submitDirectUrl(rawUrl: unknown) {
  const direct = directLinkFromUrl(rawUrl);
  if (!direct) throw new Error("Usa una URL HTTP o HTTPS directa, sin parámetros ni sesión.");
  const key = `${direct.url}\u0000${direct.name}`;
  if (activeRequests.has(key)) throw new Error("Este enlace ya se está enviando a IDG.");
  activeRequests.add(key);
  try {
    const id = crypto.randomUUID();
    const proposal: CaptureProposal = { id, ...direct, source: "direct" };
    const prepared = await request({ prepare_capture: { proposal } }, id);
    await startAccepted(id, prepared);
  } finally {
    activeRequests.delete(key);
  }
}

function installMenu() {
  void (async () => {
    await menus.removeAll();
    await menus.create({
      id: menuId,
      title: "Descargar enlace directo con IDG",
      contexts: ["link"],
    });
  })();
}

api.runtime.onInstalled.addListener(installMenu);
menus.onClicked.addListener((info) => {
  if (info.menuItemId === menuId) void submitDirectUrl(info.linkUrl).catch(() => {});
});

const onMessage = (message: unknown) => {
  if (
    typeof message !== "object" ||
    message === null ||
    (message as { type?: unknown }).type !== "download-direct"
  ) return undefined;
  const url = (message as { url?: unknown }).url;
  return submitDirectUrl(url).then(
    () => ({ ok: true }),
    (error: unknown) => ({
      ok: false,
      error: error instanceof Error ? error.message : "No se pudo enviar el enlace a IDG.",
    }),
  );
};
api.runtime.onMessage.addListener(
  onMessage as unknown as Parameters<typeof api.runtime.onMessage.addListener>[0],
);
