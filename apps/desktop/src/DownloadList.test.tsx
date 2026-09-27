// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DownloadList, supports } from "./DownloadList";
import type { DownloadView } from "./model";

afterEach(cleanup);

describe("media processing controls", () => {
  it("allows pause and cancellation while FFmpeg is processing", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn(async (_id: string, _action: string) => {});
    const row = {
      id: "media-job",
      name: "conversion.mp3",
      state: "Processing",
      category: "Música",
      domain: "127.0.0.1",
      date: "",
      total: null,
      received: 1024n,
      speed: null,
      eta: null,
      samples: [],
      resume: "Desconocida",
      snapshot: { state: "processing" },
    } as unknown as DownloadView;

    expect(supports(row, "pause")).toBe(true);
    expect(supports(row, "cancel")).toBe(true);
    render(
      <DownloadList
        rows={[row]}
        selected={new Set()}
        onSelect={() => {}}
        viewMode="Compacta"
        overrides={{ [row.id]: false }}
        setOverrides={() => {}}
        onAction={onAction}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Pausar conversion.mp3" }));
    await user.click(screen.getByLabelText("Acciones de conversion.mp3"));
    const cancel = screen.getByRole("button", { name: "Cancelar" }) as HTMLButtonElement;
    expect(cancel.disabled).toBe(false);
    await user.click(cancel);
    expect(onAction.mock.calls.map(([id, action]) => [id, action])).toEqual([
      ["media-job", "pause"],
      ["media-job", "cancel"],
    ]);
  });
});