// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { execute } from "./desktop";
import { LibraryPreferences } from "./Library";

vi.mock("./desktop", () => ({ execute: vi.fn() }));
vi.mock("./Organization", () => ({
  organize: vi.fn(),
  useOrganization: () => ({
    state: {
      library: { retention_days: null, statistics: false, clipboard: false },
      statistics: {
        completed: 0,
        bytes: "0",
        timed_bytes: "0",
        cycle_seconds: "0",
        sites: [],
        other_sites_completed: 0,
      },
    },
    error: "",
    accept: vi.fn(),
  }),
}));

afterEach(() => {
  cleanup();
  vi.mocked(execute).mockReset();
});

it("requires explicit acknowledgement before removing history metadata and confirms the count", async () => {
  const user = userEvent.setup();
  vi.mocked(execute).mockResolvedValue({
    kind: "history_metadata_cleared",
    records: 2,
  });
  render(<LibraryPreferences />);

  const clear = screen.getByRole("button", {
    name: "Eliminar metadatos terminados",
  });
  expect((clear as HTMLButtonElement).disabled).toBe(true);
  await user.click(screen.getByRole("checkbox", { name: /Confirmo quitar/ }));
  await user.click(clear);
  expect((await screen.findByRole("status")).textContent).toContain(
    "Se quitaron 2 registros terminados. Los archivos no se modificaron.",
  );
  expect(vi.mocked(execute)).toHaveBeenCalledWith({
    library: { operation: { action: "clear_history_metadata" } },
  });
});
