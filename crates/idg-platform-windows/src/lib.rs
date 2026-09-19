//! Windows-only transport. Deliberately no loopback TCP fallback.
#[cfg(windows)]
mod pipe;
#[cfg(windows)]
pub use pipe::*;
