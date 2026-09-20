fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "connect_runtime",
            "ping_runtime",
            "shutdown_runtime",
            "download_command",
            "choose_download_folder",
            "reveal_download",
            "start_runtime",
            "default_download_directory",
            "exit_desktop",
            "hide_desktop",
            "set_mini_window",
            "show_desktop",
            "read_runtime_state",
            "detect_browsers",
            "request_desktop_exit",
            "set_drop_window",
            "review_dropped_url",
            "notify_download",
        ]),
    ))
    .expect("No se pudo generar la configuración Tauri");
}
