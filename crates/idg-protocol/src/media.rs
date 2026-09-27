use crate::{DownloadError, MediaManifestKind};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq, Eq)]
pub struct MediaVariantOption {
    pub index: u32,
    pub label: String,
    pub bandwidth_bps: Option<u64>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub codecs: Vec<String>,
    pub audio_group: Option<String>,
    pub has_video: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq, Eq)]
pub struct MediaAudioOption {
    pub index: u32,
    pub group: Option<String>,
    pub label: String,
    pub language: Option<String>,
    pub is_default: bool,
    pub channels: Option<String>,
    pub external: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum MediaOutput {
    Mp4,
    Matroska,
    AudioOriginal,
    Mp3,
    Aac,
    Flac,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq, Eq)]
pub struct MediaSelection {
    pub variant_index: Option<u32>,
    pub audio_track_index: Option<u32>,
    pub output: MediaOutput,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq, Eq)]
pub struct MediaPlan {
    pub kind: MediaManifestKind,
    pub fingerprint: String,
    pub variants: Vec<MediaVariantOption>,
    pub audio_tracks: Vec<MediaAudioOption>,
    pub duration_ms: Option<u64>,
}

impl MediaPlan {
    pub fn validate_selection(&self, selection: &MediaSelection) -> Result<(), DownloadError> {
        let variant = match selection.variant_index {
            Some(index) => Some(
                self.variants
                    .get(index as usize)
                    .filter(|value| value.index == index)
                    .ok_or(DownloadError::InvalidInput)?,
            ),
            None => None,
        };
        let audio = match selection.audio_track_index {
            Some(index) => Some(
                self.audio_tracks
                    .get(index as usize)
                    .filter(|value| value.index == index)
                    .ok_or(DownloadError::InvalidInput)?,
            ),
            None => None,
        };

        let needs_video = matches!(&selection.output, MediaOutput::Mp4 | MediaOutput::Matroska);
        if needs_video && variant.is_none_or(|value| !value.has_video) {
            return Err(DownloadError::InvalidInput);
        }
        if matches!(
            selection.output,
            MediaOutput::AudioOriginal | MediaOutput::Mp3 | MediaOutput::Aac | MediaOutput::Flac
        ) && audio.is_none()
        {
            return Err(DownloadError::InvalidInput);
        }
        if !needs_video && audio.is_none() {
            return Err(DownloadError::InvalidInput);
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum MediaStage {
    Downloading,
    Combining,
    Verifying,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn plan() -> MediaPlan {
        MediaPlan {
            kind: MediaManifestKind::Dash,
            fingerprint: "0".repeat(64),
            variants: vec![MediaVariantOption {
                index: 0,
                label: "720p".into(),
                bandwidth_bps: Some(1_000_000),
                width: Some(1280),
                height: Some(720),
                codecs: vec!["avc1.64001f".into()],
                audio_group: None,
                has_video: true,
            }],
            audio_tracks: vec![MediaAudioOption {
                index: 0,
                group: None,
                label: "Español".into(),
                language: Some("es".into()),
                is_default: true,
                channels: None,
                external: true,
            }],
            duration_ms: Some(5000),
        }
    }

    #[test]
    fn selection_must_refer_to_real_tracks_and_compatible_output() {
        let plan = plan();
        assert!(
            plan.validate_selection(&MediaSelection {
                variant_index: Some(0),
                audio_track_index: Some(0),
                output: MediaOutput::Mp4,
            })
            .is_ok()
        );
        assert!(
            plan.validate_selection(&MediaSelection {
                variant_index: Some(4),
                audio_track_index: None,
                output: MediaOutput::Matroska,
            })
            .is_err()
        );
        assert!(
            plan.validate_selection(&MediaSelection {
                variant_index: None,
                audio_track_index: None,
                output: MediaOutput::Mp3,
            })
            .is_err()
        );
    }

    #[test]
    fn audio_conversion_requires_an_explicit_selected_source() {
        assert!(
            plan()
                .validate_selection(&MediaSelection {
                    variant_index: None,
                    audio_track_index: Some(0),
                    output: MediaOutput::Flac,
                })
                .is_ok()
        );
    }
}
