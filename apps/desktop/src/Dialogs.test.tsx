// @vitest-environment jsdom
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  cleanup,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NewDownloadDialog } from "./Dialogs";
import type { DesktopApi } from "./desktop";
import type { AppPreferences, MediaMetadata, MediaPlan, MediaSelection, Payload } from "../../../packages/shared-types/protocol";

vi.mock("./Organization", () => ({
  useOrganization: () => ({ state: null, error: "" }),
}));

const originalShowModal = HTMLDialogElement.prototype.showModal;
const originalClose = HTMLDialogElement.prototype.close;

beforeAll(() => {
  if (!originalShowModal) {
    HTMLDialogElement.prototype.showModal = function () {
      this.open = true;
    };
  }
  if (!originalClose) {
    HTMLDialogElement.prototype.close = function () {
      this.open = false;
    };
  }
});

afterAll(() => {
  if (originalShowModal) HTMLDialogElement.prototype.showModal = originalShowModal;
  else Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  if (originalClose) HTMLDialogElement.prototype.close = originalClose;
  else Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
});

afterEach(cleanup);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function makeBackend(overrides: Partial<DesktopApi> = {}) {
  return {
    preferences: vi.fn(async () => ({ directory: "C:\\Downloads" }) as AppPreferences),
    recoverable: vi.fn(async () => null),
    add: vi.fn(async () => ({ kind: "download" }) as Payload),
    ...overrides,
  } as unknown as DesktopApi;
}

describe("NewDownloadDialog", () => {
  it("shows field errors for embedded credentials and reserved Windows names", async () => {
    const user = userEvent.setup();
    render(
      <NewDownloadDialog
        onClose={() => {}}
        initialUrl="https://user:secret@cdn.example/file.zip"
        initialName="CON.txt"
      />,
    );

    const url = screen.getByLabelText("URL del archivo") as HTMLInputElement;
    expect(url.type).toBe("password");
    await user.click(screen.getByLabelText("Mostrar URL"));
    expect(url.type).toBe("text");
    await user.click(screen.getByRole("button", { name: "Validar datos" }));

    expect(url.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByLabelText("Nombre del archivo").getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByRole("status").textContent).toBe("Revisa los campos indicados.");
  });

  it("shows only metadata received for a directly selected media file and escapes its title", () => {
    const media: MediaMetadata = {
      kind: "video",
      title: "<img src=x onerror=alert(1)>",
      mime_type: "video/mp4",
      width: 640,
      height: 360,
      frame_rate_milli: null,
      video_codec: null,
      audio_codec: null,
      video_tracks: null,
      audio_tracks: null,
      duration_ms: null,
      size_bytes: null,
      size_kind: "unknown",
      manifest_kind: "none",
    };
    render(
      <NewDownloadDialog
        onClose={() => {}}
        backend={makeBackend()}
        captureId="media-capture-1"
        initialUrl="http://127.0.0.1:8788/clip.mp4"
        initialName="clip.mp4"
        media={media}
      />,
    );

    expect(screen.getByRole("heading", { name: media.title })).toBeTruthy();
    expect(screen.getByText("640 × 360")).toBeTruthy();
    const summary = within(screen.getByRole("region", { name: "Medio seleccionado" }));
    expect(summary.getByText("Desconocida")).toBeTruthy();
    expect(summary.getByText("Desconocido")).toBeTruthy();
    expect(summary.getByText("Desconocidos; no se deducen")).toBeTruthy();
    expect(screen.getByText(/solo al analizar un manifiesto HLS o DASH compatible/i)).toBeTruthy();
    expect(document.querySelector(".media-capture-summary img")).toBeNull();
    expect(document.querySelector<HTMLInputElement>("input[value='Videos']")).toBeNull();
    expect(screen.getByLabelText("Categoría")).toHaveProperty("value", "Videos");
  });

  it("analyzes an HLS manifest and creates the selected real media job", async () => {
    const user = userEvent.setup();
    const preferences = deferred<AppPreferences>();
    const plan: MediaPlan = {
      kind: "hls",
      fingerprint: "a".repeat(64),
      variants: [{
        index: 0,
        label: "720p · 1280×720",
        bandwidth_bps: 1_200_000n,
        width: 1280,
        height: 720,
        codecs: ["avc1.64001f", "mp4a.40.2"],
        audio_group: "audio",
        has_video: true,
      }],
      audio_tracks: [{
        index: 0,
        group: "audio",
        label: "Español",
        language: "es",
        is_default: true,
        channels: null,
        external: true,
      }],
      duration_ms: 5_000n,
    };
    const addMedia = vi.fn(async () => ({ kind: "download" }) as Payload);
    const backend = makeBackend({
      preferences: vi.fn(() => preferences.promise),
      inspectMedia: vi.fn(async () => plan),
      addMedia,
      recoverable: vi.fn(async () => null),
    });
    const onClose = vi.fn();
    render(
      <NewDownloadDialog
        backend={backend}
        onClose={onClose}
        initialUrl="http://127.0.0.1:8788/master.m3u8"
        initialName="master.m3u8"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Analizar HLS/DASH" }));
    await screen.findByRole("combobox", { name: "Variante de video" });
    expect((screen.getByLabelText("Nombre del archivo") as HTMLInputElement).value).toBe("master.mp4");
    expect(screen.getByText(/Configura FFmpeg y ffprobe/)).toBeTruthy();
    expect(backend.inspectMedia).toHaveBeenCalledWith("http://127.0.0.1:8788/master.m3u8");

    preferences.resolve({ directory: "C:\\Downloads", media_ffmpeg_path: "C:\\tools\\ffmpeg.exe" } as AppPreferences);
    await waitFor(() => expect(screen.queryByText(/Configura FFmpeg y ffprobe/)).toBeNull());
    await user.click(screen.getByRole("button", { name: "Descargar ahora" }));
    await waitFor(() => expect(addMedia).toHaveBeenCalledOnce());
    const mediaCall = addMedia.mock.calls[0] as unknown as [string, unknown, string, MediaSelection];
    expect(mediaCall[2]).toBe("a".repeat(64));
    expect(mediaCall[3]).toEqual({
      variant_index: 0,
      audio_track_index: 0,
      output: "mp4",
    });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not create a media job when FFmpeg is not configured", async () => {
    const user = userEvent.setup();
    const plan: MediaPlan = {
      kind: "dash",
      fingerprint: "b".repeat(64),
      variants: [],
      audio_tracks: [{
        index: 0,
        group: null,
        label: "Audio 1",
        language: null,
        is_default: true,
        channels: null,
        external: true,
      }],
      duration_ms: 2_000n,
    };
    const addMedia = vi.fn(async () => ({ kind: "download" }) as Payload);
    const backend = makeBackend({
      inspectMedia: vi.fn(async () => plan),
      addMedia,
      recoverable: vi.fn(async () => null),
    });
    render(
      <NewDownloadDialog
        backend={backend}
        onClose={() => {}}
        initialUrl="http://127.0.0.1:8788/audio.mpd"
        initialName="audio.mpd"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Analizar HLS/DASH" }));
    await user.click(screen.getByRole("button", { name: "Descargar ahora" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Configura FFmpeg y ffprobe");
    expect(addMedia).not.toHaveBeenCalled();
  });
  it("does not let a late preference response replace a folder the user started editing", async () => {
    const user = userEvent.setup();
    const preferences = deferred<AppPreferences>();
    const backend = makeBackend({ preferences: vi.fn(() => preferences.promise) });
    render(<NewDownloadDialog backend={backend} onClose={() => {}} />);

    const folder = screen.getByLabelText("Carpeta") as HTMLInputElement;
    await user.type(folder, "D:\\manual");
    preferences.resolve({ directory: "C:\\default" } as AppPreferences);

    await waitFor(() => expect(folder.value).toBe("D:\\manual"));
  });

  it("sends only one create request during a double click and waits for its reply", async () => {
    const user = userEvent.setup();
    const recoverable = deferred<string | null>();
    const addition = deferred<Payload>();
    const backend = makeBackend({
      recoverable: vi.fn(() => recoverable.promise),
      add: vi.fn(() => addition.promise),
    });
    const onClose = vi.fn();
    render(
      <NewDownloadDialog
        backend={backend}
        onClose={onClose}
        initialUrl="https://cdn.example/file.zip"
        initialName="file.zip"
      />,
    );

    await waitFor(() =>
      expect((screen.getByLabelText("Carpeta") as HTMLInputElement).value).toBe("C:\\Downloads"),
    );
    const submit = screen.getByRole("button", { name: "Descargar ahora" });
    await user.dblClick(submit);

    expect(backend.recoverable).toHaveBeenCalledOnce();
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    recoverable.resolve(null);

    await waitFor(() => expect(backend.add).toHaveBeenCalledOnce());
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    addition.resolve({ kind: "download" } as Payload);

    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(backend.add).toHaveBeenCalledOnce();
  });

  it("keeps the dialog open and reports a failed create instead of confirming success", async () => {
    const user = userEvent.setup();
    const backend = makeBackend({
      recoverable: vi.fn(async () => null),
      add: vi.fn(async () => {
        throw new Error("Runtime sin conexión");
      }),
    });
    const onClose = vi.fn();
    render(
      <NewDownloadDialog
        backend={backend}
        onClose={onClose}
        initialUrl="https://cdn.example/file.zip"
        initialName="file.zip"
      />,
    );

    await waitFor(() =>
      expect((screen.getByLabelText("Carpeta") as HTMLInputElement).value).toBe("C:\\Downloads"),
    );
    await user.click(screen.getByRole("button", { name: "Descargar ahora" }));

    expect((await screen.findByRole("alert")).textContent).toContain("Runtime sin conexión");
    expect(screen.getByRole("dialog", { name: "Nueva descarga" })).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    expect(backend.add).toHaveBeenCalledOnce();
  });
});
