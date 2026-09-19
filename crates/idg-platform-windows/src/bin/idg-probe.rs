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
        "shutdown" => {
            exchange(&mut pipe, Command::Shutdown, "exit").await?;
        }
        "self-test" => {
            exchange(&mut pipe, Command::Ping, "ping").await?;
            let mut second = connect().await?;
            let two = exchange(&mut second, Command::Handshake, "second").await?;
            let Payload::Hello {
                snapshot: second_snapshot,
                ..
            } = two.payload
            else {
                return Err(io::Error::other("second handshake"));
            };
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
