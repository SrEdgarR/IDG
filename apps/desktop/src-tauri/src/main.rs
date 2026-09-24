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
            notify_download
        ])
        .run(tauri::generate_context!())
        .expect("No se pudo iniciar IDG Desktop");
}
