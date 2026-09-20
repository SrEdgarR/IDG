#[cfg(windows)]
#[tokio::main]
async fn main() {
    if run().await.is_err() {
        eprintln!("IDG probe: comprobación fallida o runtime no disponible.");
        std::process::exit(1);
    }
}
#[cfg(not(windows))]
fn main() {
    std::process::exit(1);
}

#[cfg(windows)]
async fn run() -> std::io::Result<()> {
    use idg_platform_windows::{connect, exchange};
    use idg_protocol::*;
    use std::io;
    let mode = std::env::args().nth(1).unwrap_or_else(|| "ping".into());
    let mut pipe = connect().await?;
    let hello = exchange(&mut pipe, Command::Handshake, "hello").await?;
    let Payload::Hello { snapshot, .. } = hello.payload else {
        return Err(io::Error::other("handshake"));
    };
    match mode.as_str() {
        "add" | "add-segmented" | "options" | "limits" | "ranges" | "status" | "pause"
        | "resume" | "cancel" | "list" | "capabilities" => {
            let id = std::env::args().nth(2).unwrap_or_else(|| "list".into());
            let command = match mode.as_str() {
                "add-segmented" | "options" | "limits" => {
                    if mode == "limits" && std::env::args().nth(2).as_deref() != Some("set") {
                        Command::GetResourceLimits
                    } else {
                        use std::io::Read;
                        let mut bytes = Vec::new();
                        std::io::stdin()
                            .take((MAX_FRAME + 1) as u64)
                            .read_to_end(&mut bytes)?;
                        if bytes.len() > MAX_FRAME {
                            return Err(io::Error::other("input too large"));
                        }
                        match mode.as_str() {
                            "limits" => Command::SetResourceLimits {
                                limits: serde_json::from_slice(&bytes)
                                    .map_err(|_| io::Error::other("invalid limits"))?,
                            },
                            "options" => Command::SetDownloadOptions {
                                job_id: id.clone(),
                                options: serde_json::from_slice(&bytes)
                                    .map_err(|_| io::Error::other("invalid options"))?,
                            },
                            _ => {
                                #[derive(serde::Deserialize)]
                                #[serde(deny_unknown_fields)]
                                struct Input {
                                    input: NewDownload,
                                    options: TransferOptions,
                                }
                                let value: Input = serde_json::from_slice(&bytes)
                                    .map_err(|_| io::Error::other("invalid input"))?;
                                Command::AddDownloadWithOptions {
                                    input: value.input,
                                    options: value.options,
                                }
                            }
                        }
                    }
                }
                "ranges" => Command::GetDownloadRanges {
                    job_id: id.clone(),
                    offset: std::env::args()
                        .nth(3)
                        .unwrap_or_default()
                        .parse()
                        .unwrap_or(0),
                },
                "capabilities" => Command::GetDownloadCapabilities,
                "add" => {
                    use std::io::Read;
                    let mut bytes = Vec::new();
                    std::io::stdin()
                        .take((MAX_FRAME + 1) as u64)
                        .read_to_end(&mut bytes)?;
                    if bytes.len() > MAX_FRAME {
                        return Err(io::Error::other("input too large"));
                    }
                    let input: NewDownload = serde_json::from_slice(&bytes)
                        .map_err(|_| io::Error::other("invalid download input"))?;
                    Command::AddDownload { input }
                }
                "status" => Command::GetDownload { job_id: id.clone() },
                "pause" => Command::PauseDownload { job_id: id.clone() },
                "resume" => Command::ResumeDownload { job_id: id.clone() },
                "cancel" => Command::CancelDownload { job_id: id.clone() },
                _ => Command::ListDownloads {
                    offset: std::env::args()
                        .nth(2)
                        .unwrap_or_default()
                        .parse()
                        .unwrap_or(0),
                },
            };
            let response = exchange(&mut pipe, command, &id).await?;
            println!(
                "{}",
                serde_json::to_string(&response.payload).map_err(io::Error::other)?
            );
            if matches!(response.payload, Payload::DownloadFailure { .. }) {
                std::process::exit(2);
            }
        }
        "watch" => {
            exchange(&mut pipe, Command::Subscribe, "watch").await?;
            while let Some(bytes) = read_frame(&mut pipe).await? {
                let response: Response =
                    serde_json::from_slice(&bytes).map_err(io::Error::other)?;
                if matches!(response.payload, Payload::DownloadChanged { .. }) {
                    println!(
                        "{}",
                        serde_json::to_string(&response.payload).map_err(io::Error::other)?
                    );
                }
            }
        }
        "shutdown" => {
            exchange(&mut pipe, Command::Shutdown, "exit").await?;
        }
        "self-test" => {
            exchange(&mut pipe, Command::Ping, "ping").await?;
            let mut second = connect().await?;
            let two = exchange(&mut second, Command::Handshake, "second").await?;
            let Payload::Hello {
                snapshot: second_snapshot,
                capabilities,
            } = two.payload
            else {
                return Err(io::Error::other("second handshake"));
            };
            assert!(capabilities.contains(&Command::GetDownloadCapabilities));
            assert_eq!(snapshot.runtime_id, second_snapshot.runtime_id);
            assert!(second_snapshot.clients >= 2);
            exchange(&mut pipe, Command::Subscribe, "watch").await?;
            drop(second);
            let frame = tokio::time::timeout(IO_TIMEOUT, read_frame(&mut pipe))
                .await
                .map_err(io::Error::other)??
                .ok_or_else(|| io::Error::other("event EOF"))?;
            let event: Response = serde_json::from_slice(&frame).map_err(io::Error::other)?;
            assert!(matches!(event.payload, Payload::Snapshot { .. }));
            drop(pipe);
            for (raw, expected) in [
                (
                    br#"{"version":999,"id":"bad-version","command":"handshake"}"#.as_slice(),
                    ErrorCode::IncompatibleVersion,
                ),
                (
                    br#"{"version":1,"id":"no-hello","command":"ping"}"#,
                    ErrorCode::HandshakeRequired,
                ),
                (b"invalid json", ErrorCode::InvalidMessage),
            ] {
                let mut p = connect().await?;
                write_frame(&mut p, raw).await?;
                let bytes = tokio::time::timeout(IO_TIMEOUT, read_frame(&mut p))
                    .await
                    .map_err(io::Error::other)??
                    .unwrap();
                let response: Response =
                    serde_json::from_slice(&bytes).map_err(io::Error::other)?;
                assert!(matches!(response.payload, Payload::Error { code } if code == expected));
            }
            let mut p = connect().await?;
            let again = exchange(&mut p, Command::Handshake, "reconnect").await?;
            assert!(
                matches!(again.payload, Payload::Hello { snapshot: ref s, .. } if s.runtime_id == snapshot.runtime_id)
            );
            println!(
                "PASS: handshake, ping, same runtime, subscription, disconnect, reconnect, invalid JSON/version and handshake ordering"
            );
        }
        "ping" => {
            exchange(&mut pipe, Command::Ping, "ping").await?;
            println!(
                "{}",
                serde_json::to_string(&snapshot).map_err(io::Error::other)?
            );
        }
        _ => return Err(io::Error::other("unknown diagnostic command")),
    }
    Ok(())
}
