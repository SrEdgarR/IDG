fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "connect_runtime",
            "ping_runtime",
            "shutdown_runtime",
            "download_command",
            "choose_download_folder",
        ]),
    ))
    .expect("No se pudo generar la configuración Tauri");
}
