use idg_protocol::{MediaManifestKind, MediaSelection, MediaStage};
use serde::{Deserialize, Serialize};

#[derive(Clone, Serialize, Deserialize)]
pub struct MediaTask {
    pub kind: MediaManifestKind,
    pub fingerprint: String,
    pub selection: MediaSelection,
    pub main_is_video: bool,
    #[serde(default)]
    pub main_has_audio: bool,
    pub main_segments: Vec<MediaSegment>,
    #[serde(default)]
    pub audio_segments: Vec<MediaSegment>,
    pub duration_ms: Option<u64>,
    pub stage: MediaStage,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct MediaSegment {
    // Segment URLs may carry signed query strings and are stored only in the
    // runtime's existing protected job record. Never add Debug/log formatting.
    pub url: String,
    #[serde(default)]
    pub retries: u32,
    #[serde(default)]
    pub bytes: Option<u64>,
    #[serde(default)]
    pub sha256: Option<String>,
}
