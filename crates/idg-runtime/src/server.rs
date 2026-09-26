use idg_platform_windows::{listener, verify_client};
use idg_protocol::*;
use std::{
    io,
    sync::{Arc, Mutex},
};
use tokio::{
    net::windows::named_pipe::NamedPipeServer,
    sync::{Semaphore, watch},
};

struct State {
    downloads: crate::downloads::Downloads,
    snapshot: Mutex<Snapshot>,
    events: watch::Sender<Snapshot>,
    stop: watch::Sender<bool>,
}
impl State {
    fn update(&self, delta: i32, stopping: bool, native: bool) {
        let mut snapshot = self.snapshot.lock().unwrap();
        snapshot.clients = snapshot.clients.saturating_add_signed(delta);
        if native {
            snapshot.native_hosts = snapshot.native_hosts.saturating_add_signed(delta);
        }
        snapshot.sequence = snapshot.sequence.wrapping_add(1);
        snapshot.stopping |= stopping;
        self.events.send_replace(snapshot.clone());
    }
    fn snapshot(&self) -> Snapshot {
        self.snapshot.lock().unwrap().clone()
    }
}

pub async fn run() -> io::Result<()> {
    let mut pending = listener(true)?;
    let snapshot = Snapshot {
        native_hosts: 0,
        runtime_id: format!(
            "{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ),
        process_id: std::process::id(),
        sequence: 0,
        clients: 0,
        stopping: false,
    };
    let (events, _) = watch::channel(snapshot.clone());
    let (stop, mut stopped) = watch::channel(false);
    let state = Arc::new(State {
        downloads: tokio::task::spawn_blocking(crate::downloads::Downloads::open)
            .await
            .map_err(io::Error::other)?
            .map_err(|_| io::Error::other("download storage unavailable"))?,
        snapshot: Mutex::new(snapshot),
        events,
        stop,
    });
    let slots = Arc::new(Semaphore::new(16));
    let mut tasks = tokio::task::JoinSet::new();
    let mut clock = tokio::time::interval(std::time::Duration::from_secs(1));
    clock.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    loop {
        tokio::select! {
            _ = clock.tick() => {let downloads=state.downloads.clone();let _=tokio::task::spawn_blocking(move||downloads.tick()).await;},
            _ = stopped.changed() => break,
            _ = tokio::signal::ctrl_c() => break,
            result = pending.connect() => {
                result?;
                // Keep an instance alive continuously, including between accepting clients.
                let connected = std::mem::replace(&mut pending, listener(false)?);
                if verify_client(&connected).is_err() { continue; }
                let native=!idg_platform_windows::is_development_probe(&connected)&&!idg_platform_windows::is_desktop(&connected);
                let Ok(permit) = slots.clone().try_acquire_owned() else { continue; };
                let state = state.clone();
                tasks.spawn(async move {
                    let _permit = permit;
                    state.update(1, false,native);
                    let _ = serve(connected, state.clone()).await;
                    state.update(-1, false,native);
                });
            }
            Some(_) = tasks.join_next(), if !tasks.is_empty() => {}
        }
    }
    state.update(0, true, false);
    state.stop.send_replace(true);
    state.downloads.shutdown().await;
    while tasks.join_next().await.is_some() {}
    Ok(())
}

async fn serve(mut pipe: NamedPipeServer, state: Arc<State>) -> io::Result<()> {
    let can_download = idg_platform_windows::is_development_probe(&pipe)
        || idg_platform_windows::is_desktop(&pipe);
    let mut session = idg_core::Session::default();
    let mut subscribed = false;
    let events = state.events.subscribe();
    let mut stopped = state.stop.subscribe();
    loop {
        if *stopped.borrow() {
            return Ok(());
        }
        // A separate reader task is unnecessary here: read_frame must NOT be cancelled
        // midway by an event. Split once and dedicate a bounded reader below.
        if subscribed {
            return subscription(pipe, state, events, stopped, can_download).await;
        }
        let frame = tokio::select! {
            _ = stopped.changed() => return Ok(()),
            result = tokio::time::timeout(IO_TIMEOUT, read_frame(&mut pipe)) => result.map_err(|_| io::Error::from(io::ErrorKind::TimedOut))??,
        };
        let Some(bytes) = frame else {
            return Ok(());
        };
        let request = match decode_request(&bytes) {
            Ok(r) => r,
            Err(code) => {
                send(&mut pipe, &Response::error("", code)).await?;
                return Ok(());
            }
        };
        let download_command = !matches!(
            request.command,
            Command::Handshake
                | Command::Ping
                | Command::GetSnapshot
                | Command::Subscribe
                | Command::Shutdown
        );
        let native_command = matches!(
            &request.command,
            Command::GetExtensionState
                | Command::SetExtensionMode { .. }
                | Command::PauseDownload { .. }
                | Command::ResumeDownload { .. }
                | Command::PrepareCapture { .. }
                | Command::GetCaptureStatus { .. }
                | Command::StartCapture { .. }
                | Command::AbortCapture { .. }
                | Command::OpenDesktop
        );
        let mut response = if download_command && session.authorizes(&request) {
            if can_download || native_command {
                let payload = if matches!(request.command, Command::OpenDesktop) {
                    let path = std::env::current_exe()?.with_file_name("idg-desktop.exe");
                    if path.is_file() && std::process::Command::new(path).spawn().is_ok() {
                        Payload::Pong
                    } else {
                        Payload::Error {
                            code: ErrorCode::Unavailable,
                        }
                    }
                } else if can_download {
                    state.downloads.execute(request.clone()).await
                } else {
                    state.downloads.execute_extension(request.clone()).await
                };
                Response::new(&request.id, payload)
            } else {
                Response::error(&request.id, ErrorCode::Unauthorized)
            }
        } else if !can_download && request.command == Command::Shutdown {
            Response::error(&request.id, ErrorCode::Unauthorized)
        } else {
            session.handle(&request, state.snapshot())
        };
        if can_download && let Payload::Hello { capabilities, .. } = &mut response.payload {
            capabilities.push(Command::GetDownloadCapabilities);
        } else if let Payload::Hello { capabilities, .. } = &mut response.payload {
            capabilities.extend([
                Command::GetExtensionState,
                Command::SetExtensionMode {
                    mode: String::new(),
                },
                Command::PauseDownload {
                    job_id: String::new(),
                },
                Command::ResumeDownload {
                    job_id: String::new(),
                },
                Command::PrepareCapture {
                    proposal: CaptureProposal {
                        id: String::new(),
                        url: String::new(),
                        name: String::new(),
                        source: String::new(),
                    },
                },
                Command::GetCaptureStatus {
                    capture_id: String::new(),
                },
                Command::StartCapture {
                    capture_id: String::new(),
                },
                Command::AbortCapture {
                    capture_id: String::new(),
                },
                Command::OpenDesktop,
            ]);
        }
        let rejected = matches!(response.payload, Payload::Error { .. });
        subscribed = matches!(response.payload, Payload::Subscribed { .. });
        send(&mut pipe, &response).await?;
        if rejected {
            return Ok(());
        }
        if request.command == Command::Shutdown {
            state.stop.send_replace(true);
            return Ok(());
        }
    }
}

/// Subscription is a dedicated stream. Commands use a separate connection.
async fn subscription(
    pipe: NamedPipeServer,
    state: Arc<State>,
    mut events: watch::Receiver<Snapshot>,
    mut stopped: watch::Receiver<bool>,
    can_download: bool,
) -> io::Result<()> {
    let mut downloads = state.downloads.subscribe();
    let mut captures = state.downloads.subscribe_captures();
    let (mut reader, mut writer) = tokio::io::split(pipe);
    // Pin one read across event updates so partial frames cannot be discarded.
    let read = read_frame(&mut reader);
    tokio::pin!(read);
    loop {
        if *stopped.borrow() {
            return Ok(());
        }
        tokio::select! {
            result=captures.changed(), if can_download => {
                if result.is_err(){return Ok(());}
                let next = captures.borrow_and_update().clone();
                if let Some(capture_id)=next{
                    send(&mut writer,&Response::new("",Payload::CaptureChanged{capture_id})).await?;
                }
            },
            result=downloads.changed() => {
                if result.is_err(){return Ok(());}
                let job=downloads.borrow_and_update().clone();
                if let Some((sequence,job))=job{
                    let payload=if can_download {Payload::DownloadChanged{sequence,job}} else {Payload::ExtensionChanged{sequence}};
                    send(&mut writer,&Response::new("",payload)).await?;
                }
            },
            _ = stopped.changed() => { send(&mut writer, &Response::new("", Payload::Snapshot { snapshot: state.snapshot() })).await?; return Ok(()); },
            _ = &mut read => return Ok(()),
            result = events.changed() => {
                if result.is_err() { return Ok(()); }
                let snapshot = events.borrow_and_update().clone();
                send(&mut writer, &Response::new("", Payload::Snapshot { snapshot })).await?;
            }
        }
    }
}
