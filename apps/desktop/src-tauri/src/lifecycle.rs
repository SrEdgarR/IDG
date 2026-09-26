use idg_protocol::{Command, Payload, TransferState};
use std::{
    io,
    sync::atomic::{AtomicBool, Ordering},
};
use tauri::{Emitter, Manager};

#[derive(Default)]
pub struct Lifecycle {
    start: tokio::sync::Mutex<()>,
    exiting: AtomicBool,
    notifications: std::sync::Mutex<(
        std::collections::VecDeque<String>,
        Option<std::time::Instant>,
    )>,
}
#[tauri::command]
pub async fn notify_download(
    job_id: String,
    app: tauri::AppHandle,
    window: tauri::Window,
    state: tauri::State<'_, Lifecycle>,
) -> Result<bool, String> {
    use tauri_plugin_notification::NotificationExt;
    authorized(&window)?;
    let Payload::AppPreferences { preferences } = call(Command::GetAppPreferences).await? else {
        return Err("Preferencias no disponibles".into());
    };
    let Payload::Download { job } = call(Command::GetDownload { job_id }).await? else {
        return Err("Trabajo no disponible".into());
    };
    if !((job.state == TransferState::Completed && preferences.notify_completed)
        || (job.state == TransferState::Failed && preferences.notify_failed))
    {
        return Ok(false);
    }
    let mut sent = state
        .notifications
        .lock()
        .map_err(|_| "Avisos no disponibles")?;
    let key = format!("{}:{:?}", job.id, job.state);
    if sent.0.contains(&key) {
        return Ok(false);
    }
    sent.0.push_back(key);
    if sent.0.len() > 500 {
        sent.0.pop_front();
    }
    if sent
        .1
        .is_some_and(|t| t.elapsed() < std::time::Duration::from_secs(2))
    {
        return Ok(false);
    }
    sent.1 = Some(std::time::Instant::now());
    // No sound configured: the Windows adapter uses Toast.sound(None).
    // API acceptance is not proof that Windows displayed the toast (Focus Assist, development identity).
    app.notification().builder().title("IDG").body(if job.state==TransferState::Completed {"Descarga completada. Abre IDG para ver el trabajo o su carpeta."}else{"Una descarga requiere atención. Abre IDG para revisar el error y las acciones disponibles."}).show().map_err(|_|"Windows no aceptó la solicitud de aviso; el aviso permanece dentro de IDG")?;
    Ok(true)
}
#[tauri::command]
pub fn detect_browsers(window: tauri::Window) -> Result<Vec<(String, bool, String)>, String> {
    authorized(&window)?;
    let roots = ["LOCALAPPDATA", "ProgramFiles", "ProgramFiles(x86)"];
    let identity: serde_json::Value = serde_json::from_str(include_str!(
        "../../../../apps/extension/development-identity.json"
    ))
    .map_err(|_| "No se pudo leer la identidad de desarrollo")?;
    let chromium_id = identity["chromium_id"]
        .as_str()
        .ok_or("Falta el ID Chromium de desarrollo")?;
    let firefox_id = identity["firefox_id"]
        .as_str()
        .ok_or("Falta el ID Firefox de desarrollo")?;
    Ok([
        (
            "Chrome",
            "Google/Chrome/Application/chrome.exe",
            r"Software\Google\Chrome\NativeMessagingHosts\io.github.sredgarr.idg.dev",
            Some(format!("chrome-extension://{chromium_id}/")),
            None,
        ),
        (
            "Edge",
            "Microsoft/Edge/Application/msedge.exe",
            r"Software\Microsoft\Edge\NativeMessagingHosts\io.github.sredgarr.idg.dev",
            Some(format!("chrome-extension://{chromium_id}/")),
            None,
        ),
        (
            "Firefox",
            "Mozilla Firefox/firefox.exe",
            r"Software\Mozilla\NativeMessagingHosts\io.github.sredgarr.idg.dev",
            None,
            Some(firefox_id),
        ),
    ]
    .into_iter()
    .map(|(name, relative, key, origin, extension_id)| {
        (
            name.to_owned(),
            roots
                .iter()
                .filter_map(std::env::var_os)
                .any(|root| std::path::PathBuf::from(root).join(relative).is_file()),
            native_host_status(key, origin.as_deref(), extension_id),
        )
    })
    .collect())
}

#[cfg(windows)]
fn native_host_status(
    key: &str,
    chromium_origin: Option<&str>,
    firefox_id: Option<&str>,
) -> String {
    let Some(windir) = std::env::var_os("WINDIR") else {
        return "No se pudo comprobar el registro".into();
    };
    let reg = std::path::PathBuf::from(windir).join("System32/reg.exe");
    let registry_key = format!("HKCU\\{key}");
    let Ok(result) = std::process::Command::new(reg)
        .args(["query", registry_key.as_str(), "/ve"])
        .output()
    else {
        return "No se pudo comprobar el registro".into();
    };
    if !result.status.success() {
        return "Host no registrado para este navegador".into();
    }
    let output = String::from_utf8_lossy(&result.stdout);
    let Some(path) = output.lines().find_map(|line| {
        let (_, value) = line.split_once("REG_SZ")?;
        let value = value.trim();
        (!value.is_empty()).then_some(std::path::PathBuf::from(value))
    }) else {
        return "Registro sin manifiesto legible".into();
    };
    let Ok(text) = std::fs::read_to_string(path) else {
        return "Manifiesto del host no encontrado".into();
    };
    let Ok(manifest) = serde_json::from_str::<serde_json::Value>(&text) else {
        return "Manifiesto del host inválido".into();
    };
    let allowlist_matches = host_manifest_allows(&manifest, chromium_origin, firefox_id);
    let executable_exists = manifest["path"]
        .as_str()
        .is_some_and(|value| std::path::Path::new(value).is_file());
    if manifest["name"].as_str() == Some("io.github.sredgarr.idg.dev")
        && manifest["type"].as_str() == Some("stdio")
        && allowlist_matches
        && executable_exists
    {
        "Host registrado; manifiesto, ID y ejecutable comprobados".into()
    } else {
        "Registro incompatible con la extensión de desarrollo".into()
    }
}

fn host_manifest_allows(
    manifest: &serde_json::Value,
    chromium_origin: Option<&str>,
    firefox_id: Option<&str>,
) -> bool {
    chromium_origin.is_some_and(|origin| {
        manifest["allowed_origins"]
            .as_array()
            .is_some_and(|items| items.iter().any(|item| item.as_str() == Some(origin)))
    }) || firefox_id.is_some_and(|id| {
        manifest["allowed_extensions"]
            .as_array()
            .is_some_and(|items| items.iter().any(|item| item.as_str() == Some(id)))
    })
}

#[cfg(not(windows))]
fn native_host_status(
    _key: &str,
    _chromium_origin: Option<&str>,
    _firefox_id: Option<&str>,
) -> String {
    "Comprobación del registro disponible solo en Windows".into()
}

#[cfg(test)]
mod browser_detection_tests {
    use super::host_manifest_allows;

    #[test]
    fn native_host_allowlists_require_the_exact_browser_identity() {
        let firefox = serde_json::json!({
            "allowed_extensions": ["idg-dev@sredgarr.github.io"]
        });
        assert!(host_manifest_allows(
            &firefox,
            None,
            Some("idg-dev@sredgarr.github.io")
        ));
        assert!(!host_manifest_allows(
            &firefox,
            None,
            Some("other@example.test")
        ));

        let chromium = serde_json::json!({
            "allowed_origins": ["chrome-extension://keopaccdnmianljlfkpinbkfppcpfdlk/"]
        });
        assert!(host_manifest_allows(
            &chromium,
            Some("chrome-extension://keopaccdnmianljlfkpinbkfppcpfdlk/"),
            None
        ));
        assert!(!host_manifest_allows(
            &chromium,
            Some("chrome-extension://other/"),
            None
        ));
    }
}

pub async fn call(command: Command) -> Result<Payload, String> {
    let mut pipe = idg_platform_windows::connect()
        .await
        .map_err(|_| "Motor desconectado")?;
    idg_platform_windows::exchange(&mut pipe, Command::Handshake, "desktop-lifecycle")
        .await
        .map_err(|_| "No se pudo autenticar el motor")?;
    idg_platform_windows::exchange(&mut pipe, command, "lifecycle-action")
        .await
        .map(|r| r.payload)
        .map_err(|_| "No se confirmó la acción del motor".into())
}
pub fn show(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}
fn authorized(window: &tauri::Window) -> Result<(), String> {
    if window.label() != "main" {
        Err("Ventana no autorizada".into())
    } else {
        Ok(())
    }
}

#[tauri::command]
pub async fn start_runtime(
    window: tauri::Window,
    state: tauri::State<'_, Lifecycle>,
) -> Result<(), String> {
    authorized(&window)?;
    let _guard = state.start.lock().await;
    if state.exiting.load(Ordering::SeqCst) {
        return Err("IDG está cerrándose".into());
    }
    match idg_platform_windows::connect().await {
        Ok(mut pipe) => {
            idg_platform_windows::exchange(&mut pipe, Command::Handshake, "explicit-start")
                .await
                .map_err(|_| "Motor incompatible")?;
            return Ok(());
        }
        Err(e) if e.kind() == io::ErrorKind::NotFound => {}
        Err(_) => {
            return Err(
                "El canal está ocupado o no se pudo validar. No se inicia otra copia.".into(),
            );
        }
    }
    use std::os::windows::fs::{MetadataExt, OpenOptionsExt};
    use std::os::windows::process::CommandExt;
    let path = idg_platform_windows::sibling("idg-runtime.exe")
        .map_err(|_| "No se localizó el motor adjunto")?;
    for component in path.ancestors() {
        let m = std::fs::symlink_metadata(component)
            .map_err(|_| "Falta el motor o no se puede acceder a su carpeta")?;
        if m.file_attributes() & 0x400 != 0 {
            return Err("No se inicia un motor a través de un punto de redirección".into());
        }
    }
    let parent = std::env::current_exe()
        .map_err(|_| "Ruta de escritorio no válida")?
        .parent()
        .ok_or("Carpeta no válida")?
        .canonicalize()
        .map_err(|_| "Carpeta no válida")?;
    let path = path
        .canonicalize()
        .map_err(|_| "Falta idg-runtime.exe junto al escritorio; recompila el motor")?;
    if path.parent() != Some(parent.as_path()) {
        return Err("Ubicación del motor no válida".into());
    }
    // Hold a read-only handle denying replacement while launching/validating the process.
    let file = std::fs::OpenOptions::new()
        .read(true)
        .share_mode(1)
        .open(&path)
        .map_err(|_| "El ejecutable del motor está bloqueado")?;
    if !file.metadata().map_err(|_| "Motor no válido")?.is_file() {
        return Err("Motor no válido".into());
    }
    let mut child = std::process::Command::new(&path)
        .current_dir(parent)
        .creation_flags(0x08000000)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|_| "Windows no pudo iniciar el motor local")?;
    for _ in 0..100 {
        if let Ok(mut pipe) = idg_platform_windows::connect().await {
            let result =
                idg_platform_windows::exchange(&mut pipe, Command::Handshake, "started-runtime")
                    .await
                    .map_err(|_| "El motor iniciado no completó el saludo")?;
            if matches!(result.payload, Payload::Hello { .. }) {
                return Ok(());
            }
        }
        if child
            .try_wait()
            .map_err(|_| "No se pudo consultar el proceso")?
            .is_some()
        {
            return Err(
                "El motor no pudo iniciar. Comprueba almacenamiento, permisos y otra instancia."
                    .into(),
            );
        }
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    }
    Err("El motor no confirmó su inicio. No se lanzará otra copia automáticamente.".into())
}

#[tauri::command]
pub fn default_download_directory(
    app: tauri::AppHandle,
    window: tauri::Window,
) -> Result<String, String> {
    authorized(&window)?;
    app.path()
        .download_dir()
        .map(|p| p.to_string_lossy().into_owned())
        .map_err(|_| "Windows no devolvió la carpeta Descargas".into())
}

pub async fn request_exit(app: &tauri::AppHandle, ask: bool) {
    show(app);
    let mut active = 0;
    let mut unsafe_resume = 0;
    let mut offset = 0;
    let mut unknown = false;
    loop {
        match call(Command::ListDownloads { offset }).await {
            Ok(Payload::Downloads {
                jobs, next_offset, ..
            }) => {
                for j in jobs {
                    if matches!(
                        j.state,
                        TransferState::Downloading
                            | TransferState::Probing
                            | TransferState::Verifying
                            | TransferState::PublishPending
                    ) {
                        active += 1;
                        if !matches!(
                            j.resume_capability,
                            idg_protocol::ResumeCapability::RangeVerified
                        ) {
                            unsafe_resume += 1;
                        }
                    }
                }
                if let Some(next) = next_offset {
                    offset = next;
                } else {
                    break;
                }
            }
            _ => {
                unknown = true;
                break;
            }
        }
    }
    let _ = app.emit_to(
        "main",
        "desktop-exit-request",
        serde_json::json!({"active":active,"unsafe_resume":unsafe_resume,"ask":ask,"unknown":unknown}),
    );
}
#[tauri::command]
pub async fn request_desktop_exit(
    app: tauri::AppHandle,
    window: tauri::Window,
) -> Result<(), String> {
    authorized(&window)?;
    request_exit(&app, false).await;
    Ok(())
}

#[tauri::command]
pub async fn exit_desktop(
    app: tauri::AppHandle,
    window: tauri::Window,
    state: tauri::State<'_, Lifecycle>,
) -> Result<(), String> {
    authorized(&window)?;
    if state.exiting.swap(true, Ordering::SeqCst) {
        return Err("El cierre ya está en curso".into());
    }
    let result = async {
        match idg_platform_windows::connect().await {
            Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(()),
            Err(_) => return Err("No se pudo validar el motor para cerrarlo".into()),
            Ok(_) => {}
        }
        if !matches!(call(Command::Shutdown).await?, Payload::Stopping) {
            return Err("El motor no aceptó el cierre".into());
        }
        for _ in 0..300 {
            match idg_platform_windows::connect().await {
                Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(()),
                Err(_) => {}
                Ok(_) => {}
            }
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        }
        Err(
            "El motor sigue guardando datos. No se fuerza su terminación; vuelve a comprobar."
                .into(),
        )
    }
    .await;
    if result.is_ok() {
        app.exit(0);
    } else {
        state.exiting.store(false, Ordering::SeqCst);
    }
    result
}
#[tauri::command]
pub fn hide_desktop(window: tauri::Window) -> Result<(), String> {
    authorized(&window)?;
    window
        .hide()
        .map_err(|_| "No se pudo ocultar la ventana".into())
}

pub fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    use tauri::{
        menu::{Menu, MenuItem},
        tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    };
    let show_item = MenuItem::with_id(app, "show", "Mostrar IDG", true, None::<&str>)?;
    let new_item = MenuItem::with_id(app, "new", "Nueva descarga", true, None::<&str>)?;
    let pause = MenuItem::with_id(app, "pause", "Pausar todas", true, None::<&str>)?;
    let resume = MenuItem::with_id(app, "resume", "Reanudar pausadas", true, None::<&str>)?;
    let auto = MenuItem::with_id(
        app,
        "autopick",
        "AutoPick: captura pendiente",
        false,
        None::<&str>,
    )?;
    let exit = MenuItem::with_id(app, "exit", "Salir completamente", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_item, &new_item, &pause, &resume, &auto, &exit])?;
    TrayIconBuilder::with_id("idg")
        .icon(
            app.default_window_icon()
                .ok_or("Icono no disponible")?
                .clone(),
        )
        .tooltip("IDG — Internet Download Genious")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            if matches!(
                event,
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                }
            ) {
                show(tray.app_handle());
            }
        })
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show(app),
            "new" => {
                show(app);
                let _ = app.emit_to("main", "desktop-new", ());
            }
            "exit" => {
                let app = app.clone();
                tauri::async_runtime::spawn(async move {
                    request_exit(&app, false).await;
                });
            }
            "pause" | "resume" => {
                let app = app.clone();
                let pause = event.id.as_ref() == "pause";
                tauri::async_runtime::spawn(async move {
                    if tray_batch(pause).await.is_err() {
                        show(&app);
                        let _ = app.emit_to(
                            "main",
                            "desktop-notice",
                            "No se pudo completar una acción de bandeja. Revisa las filas.",
                        );
                    }
                });
            }
            _ => {}
        })
        .build(app)?;
    Ok(())
}

async fn tray_batch(pause: bool) -> Result<(), String> {
    // Stop scheduling first, so a completion cannot start another queued job during pause-all.
    if pause {
        let Payload::AppPreferences { mut preferences } = call(Command::GetAppPreferences).await?
        else {
            return Err("Preferencias no disponibles".into());
        };
        preferences.queue_running = false;
        if !matches!(
            call(Command::SetAppPreferences { preferences }).await?,
            Payload::AppPreferences { .. }
        ) {
            return Err("No se pudo detener la cola".into());
        }
    }
    let mut offset = 0;
    let mut failed = false;
    loop {
        let Payload::Downloads {
            jobs, next_offset, ..
        } = call(Command::ListDownloads { offset }).await?
        else {
            return Err("Historial no disponible".into());
        };
        for job in jobs {
            let applicable = if pause {
                matches!(
                    job.state,
                    TransferState::Downloading | TransferState::Probing | TransferState::Queued
                )
            } else {
                job.state == TransferState::Paused
            };
            if applicable {
                let command = if pause {
                    Command::PauseDownload { job_id: job.id }
                } else {
                    Command::ResumeDownload { job_id: job.id }
                };
                failed |= !matches!(call(command).await, Ok(Payload::Download { .. }));
            }
        }
        if let Some(next) = next_offset {
            offset = next;
        } else {
            break;
        }
    }
    if failed {
        Err("Una o más acciones fueron rechazadas".into())
    } else {
        Ok(())
    }
}

pub fn close_requested(window: &tauri::Window, event: &tauri::WindowEvent) {
    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
        if window.label() != "main" {
            return;
        }
        api.prevent_close();
        let app = window.app_handle().clone();
        let window = window.clone();
        tauri::async_runtime::spawn(async move {
            match call(Command::GetAppPreferences).await {
                Ok(Payload::AppPreferences { preferences })
                    if preferences.close_action == "exit" =>
                {
                    request_exit(&app, false).await
                }
                Ok(Payload::AppPreferences { preferences })
                    if preferences.close_action == "ask" =>
                {
                    request_exit(&app, true).await
                }
                _ => {
                    let _ = window.hide();
                }
            }
        });
    }
}
