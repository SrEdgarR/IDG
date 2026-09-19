#[cfg(windows)]
mod downloads;
#[cfg(windows)]
mod server;

#[cfg(windows)]
#[tokio::main]
async fn main() {
    if server::run().await.is_err() {
        eprintln!("IDG: runtime no disponible; compruebe instancia, permisos y configuración.");
        std::process::exit(1);
    }
}
#[cfg(not(windows))]
fn main() {
    eprintln!("IDG runtime requiere Windows.");
    std::process::exit(1);
}
