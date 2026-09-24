//! Windows-only transport. Deliberately no loopback TCP fallback.
#[cfg(windows)]
mod pipe;
#[cfg(windows)]
pub use pipe::*;
#[cfg(windows)]
pub mod clipboard;
#[cfg(windows)]
pub mod files;
#[cfg(windows)]
pub mod power;
