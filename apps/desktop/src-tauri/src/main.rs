#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use idg_protocol::{Command, ConnectionState, Payload, Response, VERSION, read_frame};
use std::sync::Mutex;
use tauri::Emitter;
use tauri::Manager;
mod lifecycle;
use lifecycle::detect_browsers;
use lifecycle::notify_download;
use lifecycle::request_desktop_exit;
use lifecycle::{default_download_directory, exit_desktop, hide_desktop, start_runtime};

#[derive(Default)]
struct Connection(Mutex<Option<tauri::async_runtime::JoinHandle<()>>>);

fn report(app: &tauri::AppHandle, snapshot: Option<idg_protocol::Snapshot>, error: Option<&str>) {
    let connected = snapshot.as_ref().is_some_and(|s| !s.stopping);
    let state = ConnectionState {
        connected,
        snapshot: if connected { snapshot } else { None },
        error: error.map(str::to_owned),
    };
    let _ = app.emit_to("main", "runtime-state", &state);
    let _ = app.emit_to("mini", "runtime-state", &state);
}

#[tauri::command]
async fn connect_runtime(
    app: tauri::AppHandle,
    connection: tauri::State<'_, Connection>,
    window: tauri::Window,
) -> Result<(), String> {
    if window.label() != "main" {
        return Err("Ventana no autorizada".into());
    }
    let mut guard = connection.0.lock().map_err(|_| "Estado no disponible")?;
    if let Some(task) = guard.take() {
        task.abort();
    }
    report(&app, None, None);
    *guard = Some(tauri::async_runtime::spawn(async move {
        let result = async {
            let mut pipe = idg_platform_windows::connect().await?;
            idg_platform_windows::exchange(&mut pipe, Command::Handshake, "desktop-hello").await?;
            let response =
                idg_platform_windows::exchange(&mut pipe, Command::Subscribe, "desktop-watch")
                    .await?;
            let Payload::Subscribed { snapshot } = response.payload else {
                return Err(std::io::Error::other("subscription"));
            };
            let runtime_id = snapshot.runtime_id.clone();
            let mut sequence = snapshot.sequence;
            report(&app, Some(snapshot), None);
            while let Some(bytes) = read_frame(&mut pipe).await? {
                let response: Response =
                    serde_json::from_slice(&bytes).map_err(std::io::Error::other)?;
                if response.version != VERSION {
                    return Err(std::io::Error::other("version"));
                }
                if let Payload::DownloadChanged { .. } = response.payload {
                    let _ = app.emit_to("main", "download-changed", &response.payload);
                    let _ = app.emit_to("mini", "download-changed", &response.payload);
                    continue;
                }
                if let Payload::CaptureChanged { .. } = response.payload {
                    let _ = app.emit_to("main", "capture-requested", &response.payload);
                    continue;
                }
                if let Payload::Snapshot { snapshot } = response.payload {
                    // Events are complete snapshots, so coalescing/gaps require no delta replay.
                    if snapshot.runtime_id != runtime_id || snapshot.sequence < sequence {
                        return Err(std::io::Error::other("event order"));
                    }
                    sequence = snapshot.sequence;
                    report(&app, Some(snapshot), None);
                } else {
                    return Err(std::io::Error::other("event"));
                }
            }
            Ok::<_, std::io::Error>(())
        }
        .await;
        report(
            &app,
            None,
            Some(if result.is_err() {
                "No se pudo conectar con el motor. Comprueba que esté iniciado."
            } else {
                "El motor se ha detenido o la conexión se ha cerrado."
            }),
        );
    }));
    Ok(())
}

#[tauri::command]
async fn download_command(
    request: idg_protocol::Request,
    window: tauri::Window,
) -> Result<Payload, String> {
    let mini_read = window.label() == "mini"
        && matches!(
            request.command,
            Command::ListDownloads { .. } | Command::GetDownload { .. }
        );
    if (window.label() != "main" && !mini_read)
        || !matches!(
            request.command,
            Command::AddDownloadWithOptions { .. }
                | Command::Organization { .. }
                | Command::Library { .. }
                | Command::FindRecoverableDownload { .. }
                | Command::CreateDownload { .. }
                | Command::InspectMediaManifest { .. }
                | Command::CreateMediaDownload { .. }
                | Command::GetCaptureRequests
                | Command::RejectCapture { .. }
                | Command::GetAppPreferences
                | Command::SetAppPreferences { .. }
                | Command::GetDownload { .. }
                | Command::ListDownloads { .. }
                | Command::PauseDownload { .. }
                | Command::ResumeDownload { .. }
                | Command::CancelDownload { .. }
                | Command::GetResourceLimits
                | Command::SetResourceLimits { .. }
                | Command::SetDownloadOptions { .. }
                | Command::GetDownloadRanges { .. }
        )
    {
        return Err("Acción no autorizada".into());
    }
    let bytes = serde_json::to_vec(&request).map_err(|_| "Solicitud no válida")?;
    if bytes.len() > idg_protocol::MAX_FRAME
        || request.version != VERSION
        || idg_protocol::decode_request(&bytes).is_err()
    {
        return Err("Solicitud no válida".into());
    }
    let mut pipe = idg_platform_windows::connect()
        .await
        .map_err(|_| "El motor está desconectado; los datos se conservan.")?;
    idg_platform_windows::exchange(&mut pipe, Command::Handshake, "desktop-action")
        .await
        .map_err(|_| "No se pudo autenticar el motor")?;
    idg_platform_windows::exchange(&mut pipe, request.command, &request.id)
        .await
        .map(|r| r.payload)
        .map_err(|_| "No se confirmó la acción. Puedes reintentar sin duplicar el trabajo.".into())
}

#[tauri::command]
async fn set_mini_window(
    enabled: bool,
    app: tauri::AppHandle,
    window: tauri::Window,
) -> Result<(), String> {
    if window.label() != "main" {
        return Err("Ventana no autorizada".into());
    }
    if enabled {
        if let Some(w) = app.get_webview_window("mini") {
            w.show().map_err(|_| "No se pudo mostrar la mini ventana")?;
        } else {
            tauri::WebviewWindowBuilder::new(
                &app,
                "mini",
                tauri::WebviewUrl::App("index.html".into()),
            )
            .title("IDG · Progreso")
            .inner_size(380., 220.)
            .resizable(true)
            .always_on_top(true)
            .build()
            .map_err(|_| "No se pudo abrir la mini ventana")?;
        }
    } else if let Some(w) = app.get_webview_window("mini") {
        w.close().map_err(|_| "No se pudo cerrar la mini ventana")?;
    }
    Ok(())
}
#[tauri::command]
fn show_desktop(app: tauri::AppHandle, window: tauri::Window) -> Result<(), String> {
    if !["main", "mini", "drop"].contains(&window.label()) {
        return Err("Ventana no autorizada".into());
    }
    lifecycle::show(&app);
    Ok(())
}
#[tauri::command]
async fn set_drop_window(
    enabled: bool,
    app: tauri::AppHandle,
    window: tauri::Window,
) -> Result<(), String> {
    if window.label() != "main" {
        return Err("Ventana no autorizada".into());
    }
    if enabled {
        if let Some(w) = app.get_webview_window("drop") {
            w.show()
                .map_err(|_| "No se pudo mostrar la zona de enlaces")?;
        } else {
            tauri::WebviewWindowBuilder::new(
                &app,
                "drop",
                tauri::WebviewUrl::App("index.html".into()),
            )
            .title("IDG · Soltar enlace")
            .inner_size(320., 180.)
            .always_on_top(true)
            .disable_drag_drop_handler()
            .build()
            .map_err(|_| "No se pudo abrir la zona de enlaces")?;
        }
    } else if let Some(w) = app.get_webview_window("drop") {
        w.close()
            .map_err(|_| "No se pudo cerrar la zona de enlaces")?;
    }
    Ok(())
}
#[tauri::command]
fn review_dropped_url(
    url: String,
    app: tauri::AppHandle,
    window: tauri::Window,
) -> Result<(), String> {
    if !["main", "drop"].contains(&window.label()) || url.len() > 8192 {
        return Err("Enlace no válido".into());
    }
    let parsed = tauri::Url::parse(&url).map_err(|_| "Enlace no válido")?;
    if !["http", "https"].contains(&parsed.scheme())
        || parsed.host_str().is_none()
        || !parsed.username().is_empty()
        || parsed.password().is_some()
    {
        return Err("Usa un enlace HTTP o HTTPS sin credenciales incrustadas".into());
    }
    lifecycle::show(&app);
    app.emit_to("main", "desktop-drop", url)
        .map_err(|_| "No se pudo abrir la revisión del enlace".into())
}
#[tauri::command]
async fn read_runtime_state(window: tauri::Window) -> Result<Payload, String> {
    if !["main", "mini"].contains(&window.label()) {
        return Err("Ventana no autorizada".into());
    }
    lifecycle::call(Command::GetSnapshot).await
}

fn diagnostics_report(runtime_connected: bool) -> Result<String, String> {
    let report = serde_json::json!({
        "format": "idg-diagnostics-v1",
        "applicationVersion": env!("CARGO_PKG_VERSION"),
        "platform": std::env::consts::OS,
        "architecture": std::env::consts::ARCH,
        "runtimeConnected": runtime_connected,
        "persistentLogsPresent": false,
        "redactions": [
            "URLs, nombres de archivo y rutas",
            "cookies, cabeceras y credenciales",
            "IDs de trabajos y contenido descargado",
            "historial, estadísticas y reglas",
            "logs persistentes: IDG no los crea",
        ],
    });
    serde_json::to_string_pretty(&report).map_err(|_| "No se pudo preparar el diagnóstico".into())
}

async fn current_diagnostics_report() -> Result<String, String> {
    let runtime_connected = matches!(
        lifecycle::call(Command::GetSnapshot).await,
        Ok(Payload::Snapshot { snapshot }) if !snapshot.stopping
    );
    diagnostics_report(runtime_connected)
}

#[tauri::command]
async fn diagnostics_preview(window: tauri::Window) -> Result<String, String> {
    if window.label() != "main" {
        return Err("Ventana no autorizada".into());
    }
    current_diagnostics_report().await
}

fn write_diagnostics_file(path: &std::path::Path, report: &str) -> Result<(), String> {
    use std::io::Write;
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|error| {
            if error.kind() == std::io::ErrorKind::AlreadyExists {
                String::from("Ese archivo ya existe; elige un nombre distinto. No se sobrescribió.")
            } else {
                String::from("No se pudo crear el archivo de diagnóstico")
            }
        })?;
    file.write_all(report.as_bytes())
        .and_then(|()| file.sync_all())
        .map_err(|_| "No se pudo escribir el diagnóstico".into())
}

#[tauri::command]
async fn export_diagnostics(app: tauri::AppHandle, window: tauri::Window) -> Result<bool, String> {
    use tauri_plugin_dialog::DialogExt;
    if window.label() != "main" {
        return Err("Ventana no autorizada".into());
    }
    let (send, receive) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_parent(&window)
        .set_title("Guardar diagnóstico de IDG")
        .set_file_name("IDG-diagnostico.json")
        .add_filter("JSON", &["json"])
        .save_file(move |file| {
            let _ = send.send(file.and_then(|file| file.into_path().ok()));
        });
    let Some(path) = receive
        .await
        .map_err(|_| "No se pudo elegir el archivo de diagnóstico".to_string())?
    else {
        return Ok(false);
    };
    let report = current_diagnostics_report().await?;
    write_diagnostics_file(&path, &report)?;
    Ok(true)
}

#[cfg(test)]
mod diagnostics_tests {
    use super::{diagnostics_report, write_diagnostics_file};

    #[test]
    fn diagnostics_report_contains_only_minimal_state_and_redaction_rules() {
        let json: serde_json::Value =
            serde_json::from_str(&diagnostics_report(false).unwrap()).unwrap();
        let object = json.as_object().unwrap();
        assert_eq!(object["runtimeConnected"], false);
        assert_eq!(object["persistentLogsPresent"], false);
        assert_eq!(object["redactions"].as_array().unwrap().len(), 5);
        for field in [
            "downloads",
            "jobs",
            "urls",
            "paths",
            "credentials",
            "history",
        ] {
            assert!(
                !object.contains_key(field),
                "unexpected diagnostic field: {field}"
            );
        }
    }

    #[test]
    fn diagnostics_export_never_overwrites_an_existing_file() {
        let directory = std::env::temp_dir().join(format!(
            "idg-diagnostics-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir(&directory).unwrap();
        let path = directory.join("existing.json");
        std::fs::write(&path, b"preserve").unwrap();
        assert!(write_diagnostics_file(&path, "replacement").is_err());
        assert_eq!(std::fs::read(&path).unwrap(), b"preserve");
        std::fs::remove_dir_all(directory).unwrap();
    }
}

#[tauri::command]
async fn choose_download_folder(
    app: tauri::AppHandle,
    window: tauri::Window,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    if window.label() != "main" {
        return Err("Ventana no autorizada".into());
    }
    let (send, receive) = tokio::sync::oneshot::channel();
    app.dialog().file().pick_folder(move |folder| {
        let _ = send.send(
            folder
                .and_then(|f| f.into_path().ok())
                .map(|p| p.to_string_lossy().into_owned()),
        );
    });
    receive
        .await
        .map_err(|_| "No se pudo elegir la carpeta".into())
}

#[tauri::command]
async fn choose_ffmpeg_file(
    app: tauri::AppHandle,
    window: tauri::Window,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    if window.label() != "main" {
        return Err("Ventana no autorizada".into());
    }
    let (send, receive) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .add_filter("FFmpeg para Windows", &["exe"])
        .pick_file(move |file| {
            let _ = send.send(
                file.and_then(|file| file.into_path().ok())
                    .map(|path| path.to_string_lossy().into_owned()),
            );
        });
    receive.await.map_err(|_| "No se pudo elegir FFmpeg".into())
}

#[tauri::command]
async fn choose_download_file(
    app: tauri::AppHandle,
    window: tauri::Window,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    if window.label() != "main" {
        return Err("Ventana no autorizada".into());
    }
    let (send, receive) = tokio::sync::oneshot::channel();
    app.dialog().file().pick_file(move |file| {
        let _ = send.send(
            file.and_then(|file| file.into_path().ok())
                .map(|path| path.to_string_lossy().into_owned()),
        );
    });
    receive
        .await
        .map_err(|_| "No se pudo elegir el archivo".into())
}

#[tauri::command]
async fn reveal_download(job_id: String, window: tauri::Window) -> Result<(), String> {
    if window.label() != "main" {
        return Err("Ventana no autorizada".into());
    }
    let mut pipe = idg_platform_windows::connect()
        .await
        .map_err(|_| "Motor desconectado")?;
    idg_platform_windows::exchange(&mut pipe, Command::Handshake, "folder-hello")
        .await
        .map_err(|_| "Motor no autenticado")?;
    let result = idg_platform_windows::exchange(
        &mut pipe,
        Command::GetDownloadDirectory { job_id },
        "folder",
    )
    .await
    .map_err(|_| "No se pudo consultar el destino")?;
    let Payload::DownloadDirectory { directory } = result.payload else {
        return Err("Carpeta no disponible para este trabajo".into());
    };
    let path = std::path::Path::new(&directory);
    if !path.is_absolute() || !path.is_dir() || directory.contains('\0') {
        return Err("Carpeta no válida".into());
    }
    let wide: Vec<u16> = directory.encode_utf16().chain(Some(0)).collect();
    let verb: Vec<u16> = "explore".encode_utf16().chain(Some(0)).collect();
    let result = unsafe {
        windows_sys::Win32::UI::Shell::ShellExecuteW(
            std::ptr::null_mut(),
            verb.as_ptr(),
            wide.as_ptr(),
            std::ptr::null(),
            std::ptr::null(),
            windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL,
        )
    };
    if result as isize <= 32 {
        return Err("Windows no pudo abrir la carpeta".into());
    }
    Ok(())
}

async fn command(command: Command, window: tauri::Window) -> Result<(), String> {
    if window.label() != "main" {
        return Err("Ventana no autorizada".into());
    }
    let result = async {
        let mut pipe = idg_platform_windows::connect().await?;
        idg_platform_windows::exchange(&mut pipe, Command::Handshake, "action-hello").await?;
        idg_platform_windows::exchange(&mut pipe, command, "action").await
    }
    .await;
    result
        .map(|_| ())
        .map_err(|_| "No se pudo comunicar con el motor".into())
}
#[tauri::command]
async fn ping_runtime(window: tauri::Window) -> Result<(), String> {
    command(Command::Ping, window).await
}
#[tauri::command]
async fn shutdown_runtime(window: tauri::Window) -> Result<(), String> {
    command(Command::Shutdown, window).await
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            lifecycle::show(app);
            let _ = app.emit_to("main", "desktop-launch", ());
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .manage(lifecycle::Lifecycle::default())
        .manage(Connection::default())
        .setup(lifecycle::setup)
        .on_window_event(lifecycle::close_requested)
        .invoke_handler(tauri::generate_handler![
            connect_runtime,
            ping_runtime,
            shutdown_runtime,
            download_command,
            choose_download_folder,
            choose_download_file,
            choose_ffmpeg_file,
            reveal_download,
            start_runtime,
            default_download_directory,
            exit_desktop,
            hide_desktop,
            set_mini_window,
            show_desktop,
            read_runtime_state,
            detect_browsers,
            request_desktop_exit,
            set_drop_window,
            review_dropped_url,
            notify_download,
            diagnostics_preview,
            export_diagnostics
        ])
        .run(tauri::generate_context!())
        .expect("No se pudo iniciar IDG Desktop");
}
