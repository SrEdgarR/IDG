#[cfg(windows)]
#[tokio::main]
async fn main() {
    let result = bridge().await;
    if result.is_err() {
        eprintln!("IDG: conexión nativa cerrada o no disponible.");
    }
    // Tokio stdin uses a blocking OS read; it cannot be cancelled by runtime loss.
    // Frames are flushed before returning. End the host even if stdin stays open.
    std::process::exit(if result.is_ok() { 0 } else { 1 });
}

#[cfg(windows)]
async fn bridge() -> std::io::Result<()> {
    use idg_protocol::*;
    let mut pipe = idg_platform_windows::connect().await?;
    // Browser allowlists live in per-user host manifests, never in arbitrary page data.
    // No automatic runtime startup: explicit exit remains effective.
    let (mut pipe_reader, mut pipe_writer) = tokio::io::split(&mut pipe);
    let to_runtime = async {
        let mut input = tokio::io::stdin();
        while let Some(bytes) = read_frame(&mut input).await? {
            if decode_request(&bytes).is_err() {
                return Err(std::io::Error::from(std::io::ErrorKind::InvalidData));
            }
            write_frame(&mut pipe_writer, &bytes).await?;
        }
        Ok::<_, std::io::Error>(())
    };
    let from_runtime = async {
        let mut output = tokio::io::stdout();
        while let Some(bytes) = read_frame(&mut pipe_reader).await? {
            write_frame(&mut output, &bytes).await?;
        }
        Ok::<_, std::io::Error>(())
    };
    tokio::select! { result = to_runtime => result, result = from_runtime => result }
}

#[cfg(not(windows))]
fn main() {
    eprintln!("IDG host requiere Windows.");
    std::process::exit(1);
}
