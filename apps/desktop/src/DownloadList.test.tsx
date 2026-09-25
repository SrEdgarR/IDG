// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DownloadList } from "./DownloadList";
import type { DownloadView } from "./model";

afterEach(cleanup);

function download(overrides: Partial<DownloadView> = {}): DownloadView {
  return {
    id: "job-01",
    name: "archivo.bin",
    state: "Downloading",
    category: "Otros",
    domain: "cdn.example",
    date: "2026-09-25",
    total: 100n,
    received: 25n,
    speed: null,
    eta: null,
    samples: [],
    resume: "Desconocida",
    ...overrides,
  };
}

function InteractiveList({ row }: { row: DownloadView }) {
  const [selected, setSelected] = useState(() => new Set<string>());
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  return (
    <DownloadList
      rows={[row]}
      selected={selected}
      onSelect={(id) =>
        setSelected((current) => {
          const next = new Set(current);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        })
      }
      viewMode="Compacta"
      overrides={overrides}
      setOverrides={setOverrides}
    />
  );
}

describe("DownloadList", () => {
  it("keeps row selection independent from expanding its details", async () => {
    const user = userEvent.setup();
    render(<InteractiveList row={download()} />);

    const checkbox = screen.getByRole("checkbox", { name: "Seleccionar archivo.bin" }) as HTMLInputElement;
    const title = screen.getByRole("button", { name: /archivo\.bin cdn\.example/ });
    expect(title.getAttribute("aria-expanded")).toBe("false");

    await user.click(checkbox);
    expect(checkbox.checked).toBe(true);
    expect(title.getAttribute("aria-expanded")).toBe("false");

    await user.click(title);
    expect(title.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("region", { name: "Detalles de archivo.bin" })).toBeTruthy();

    await user.click(checkbox);
    expect(checkbox.checked).toBe(false);
    expect(title.getAttribute("aria-expanded")).toBe("true");
  });

  it("calculates progress exactly for unsigned 64-bit byte counters", () => {
    const maximumU64 = 18_446_744_073_709_551_615n;
    render(
      <DownloadList
        rows={[
          download({
            total: maximumU64,
            received: maximumU64 - 1n,
          }),
        ]}
        selected={new Set()}
        onSelect={() => {}}
        viewMode="Compacta"
        overrides={{}}
        setOverrides={() => {}}
      />,
    );

    const progress = screen.getByRole("progressbar", {
      name: "Progreso de archivo.bin",
    }) as HTMLProgressElement;
    expect(progress.value).toBe(99.99);
    expect(screen.getByText("99 %")).toBeTruthy();
  });
});
