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
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NewDownloadDialog } from "./Dialogs";
import type { DesktopApi } from "./desktop";
import type { AppPreferences, Payload } from "../../../packages/shared-types/protocol";

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
