// IDG_PREFERENCES_TEST_FIXTURE: imported only by browser tests, never by production entries.
import { createRoot } from "react-dom/client";
import { NewDownloadDialog } from "../Dialogs";
import { ImportDialog } from "../Import";
import type { DesktopApi } from "../desktop";
import type { AppPreferences } from "../../../../packages/shared-types/protocol";

export function openFocusFixture(kind: "new" | "import") {
  let release!: (value: AppPreferences) => void;
  const pending = new Promise<AppPreferences>((resolve) => {
    release = resolve;
  });
  // Only the preference result is controlled here. Real IPC/download coverage lives in Tauri tests.
  const backend = { preferences: () => pending } as DesktopApi;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  root.render(
    kind === "new" ? (
      <NewDownloadDialog backend={backend} onClose={() => {}} />
    ) : (
      <ImportDialog backend={backend} onClose={() => {}} />
    ),
  );
  return {
    release: () =>
      release({
        directory: "C:\\IDG_PREFERENCES_TEST_FIXTURE",
      } as AppPreferences),
    close: () => {
      root.unmount();
      container.remove();
    },
  };
}
