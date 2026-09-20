// Phase 05 supersedes the old manual-start desktop smoke test. The real Tauri
// scenario now includes startup, handshake/ping, stop/no-relaunch/restart,
// window-close isolation, durable downloads and checkpoint recovery.
await import('./test-app-download.mjs');
await import('./test-desktop-start-failure.mjs');
