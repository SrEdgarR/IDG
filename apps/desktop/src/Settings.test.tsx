// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import { DiagnosticsExport } from "./Settings";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.mocked(invoke).mockReset();
});

describe("diagnostic export", () => {
  it("previews the redacted report before exporting and confirms a saved file", async () => {
    const user = userEvent.setup();
    vi.mocked(invoke)
      .mockResolvedValueOnce('{"format":"idg-diagnostics-v1"}')
      .mockResolvedValueOnce(true);
    render(<DiagnosticsExport />);

    const save = screen.getByRole("button", { name: "Guardar diagnóstico…" });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    await user.click(
      screen.getByRole("button", { name: "Actualizar vista previa" }),
    );
    expect(
      screen.getByLabelText("Vista previa del diagnóstico").textContent,
    ).toContain("idg-diagnostics-v1");
    await user.click(save);
    expect((await screen.findByRole("status")).textContent).toContain(
      "Diagnóstico guardado.",
    );
    expect(vi.mocked(invoke).mock.calls.map(([command]) => command)).toEqual([
      "diagnostics_preview",
      "export_diagnostics",
    ]);
  });

  it("reports cancellation and native export errors without claiming success", async () => {
    const user = userEvent.setup();
    vi.mocked(invoke)
      .mockResolvedValueOnce('{"format":"idg-diagnostics-v1"}')
      .mockResolvedValueOnce(false)
      .mockRejectedValueOnce("No se pudo crear el archivo");
    render(<DiagnosticsExport />);
    await user.click(
      screen.getByRole("button", { name: "Actualizar vista previa" }),
    );
    const save = screen.getByRole("button", { name: "Guardar diagnóstico…" });
    await user.click(save);
    expect((await screen.findByRole("status")).textContent).toContain(
      "Exportación cancelada.",
    );
    await user.click(save);
    expect((await screen.findByRole("alert")).textContent).toContain(
      "No se pudo crear el archivo",
    );
    expect(screen.queryByText("Diagnóstico guardado.")).toBeNull();
  });
});
