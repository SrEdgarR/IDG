#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use idg_protocol::{Command, ConnectionState, Payload, Response, VERSION, read_frame};
use std::sync::Mutex;
use tauri::Emitter;

#[derive(Default)]
struct Connection(Mutex<Option<tauri::async_runtime::JoinHandle<()>>>);

fn report(app: &tauri::AppHandle, snapshot: Option<idg_protocol::Snapshot>, error: Option<&str>) {
    let connected = snapshot.as_ref().is_some_and(|s| !s.stopping);
    let _ = app.emit_to(
        "main",
        "runtime-state",
        ConnectionState {
            connected,
            snapshot: if connected { snapshot } else { None },
            error: error.map(str::to_owned),
        },
    );
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
        .manage(Connection::default())
        .invoke_handler(tauri::generate_handler![
            connect_runtime,
            ping_runtime,
            shutdown_runtime
        ])
        .run(tauri::generate_context!())
        .expect("No se pudo iniciar IDG Desktop");
}
