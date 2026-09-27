use crate::DownloadSnapshot;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Only public, recent work is exposed to a browser profile. URLs and paths
/// never cross this interface, and private jobs are omitted by the runtime.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct ExtensionState {
    pub autopick_mode: String,
    pub active_count: u32,
    pub jobs: Vec<DownloadSnapshot>,
}

#[derive(Clone, Serialize, Deserialize, TS, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct CaptureProposal {
    pub id: String,
    pub url: String,
    pub name: String,
    pub source: String,
    #[serde(default)]
    pub media: Option<MediaMetadata>,
}

impl std::fmt::Debug for CaptureProposal {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("CaptureProposal")
            .field("id", &self.id)
            .field("url", &"[redacted]")
            .field("name", &"[redacted]")
            .field("source", &self.source)
            .field("has_media", &self.media.is_some())
            .finish()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum MediaKind {
    Video,
    Audio,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum MediaManifestKind {
    None,
    Hls,
    Dash,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum MediaSizeKind {
    Unknown,
    Exact,
    Estimated,
}

/// Sanitized metadata from a media element/request. It never contains its URL,
/// page origin, credentials, or thumbnail URL.
#[derive(Clone, Serialize, Deserialize, TS, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct MediaMetadata {
    pub kind: MediaKind,
    pub title: String,
    pub mime_type: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub frame_rate_milli: Option<u32>,
    pub video_codec: Option<String>,
    pub audio_codec: Option<String>,
    pub video_tracks: Option<u8>,
    pub audio_tracks: Option<u8>,
    /// Decimal strings avoid loss of precision when the UI handles 64-bit data.
    pub duration_ms: Option<String>,
    pub size_bytes: Option<String>,
    pub size_kind: MediaSizeKind,
    pub manifest_kind: MediaManifestKind,
}

impl MediaMetadata {
    pub fn validate(&self) -> Result<(), crate::DownloadError> {
        fn optional_text(value: &Option<String>, limit: usize) -> bool {
            value
                .as_ref()
                .is_none_or(|text| text.len() <= limit && !text.chars().any(char::is_control))
        }
        fn decimal(value: &Option<String>, limit: usize) -> bool {
            value.as_ref().is_none_or(|text| {
                !text.is_empty()
                    && text.len() <= limit
                    && text.bytes().all(|byte| byte.is_ascii_digit())
                    && text.parse::<u64>().is_ok()
            })
        }

        let mime_valid = self.mime_type.as_ref().is_none_or(|mime| {
            let mut parts = mime.split('/');
            let token = |part: &str| {
                !part.is_empty()
                    && part
                        .bytes()
                        .all(|byte| byte.is_ascii_alphanumeric() || b"!#$&^_.+-".contains(&byte))
            };
            mime.len() <= 120
                && !mime.chars().any(char::is_control)
                && parts.next().is_some_and(token)
                && parts.next().is_some_and(token)
                && parts.next().is_none()
        });
        let dimensions_valid = self.width.is_none_or(|value| (1..=16_384).contains(&value))
            && self
                .height
                .is_none_or(|value| (1..=16_384).contains(&value));
        let duration_valid = decimal(&self.duration_ms, 12)
            && self.duration_ms.as_ref().is_none_or(|duration| {
                duration
                    .parse::<u64>()
                    .is_ok_and(|value| value <= 604_800_000)
            });
        let size_valid = decimal(&self.size_bytes, 20)
            && matches!(
                (&self.size_kind, &self.size_bytes),
                (MediaSizeKind::Unknown, None)
                    | (MediaSizeKind::Exact | MediaSizeKind::Estimated, Some(_))
            );

        if self.title.len() > 500
            || self.title.chars().any(char::is_control)
            || !optional_text(&self.video_codec, 100)
            || !optional_text(&self.audio_codec, 100)
            || !mime_valid
            || !dimensions_valid
            || self.frame_rate_milli.is_some_and(|value| value > 1_000_000)
            || self.video_tracks.is_some_and(|value| value > 32)
            || self.audio_tracks.is_some_and(|value| value > 32)
            || !duration_valid
            || !size_valid
            || self.manifest_kind != MediaManifestKind::None
        {
            return Err(crate::DownloadError::InvalidInput);
        }
        Ok(())
    }
}

impl std::fmt::Debug for MediaMetadata {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("MediaMetadata")
            .field("kind", &self.kind)
            .field("title", &"[redacted]")
            .field("mime_type", &self.mime_type)
            .field("width", &self.width)
            .field("height", &self.height)
            .field("size_kind", &self.size_kind)
            .finish_non_exhaustive()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum CaptureDecision {
    Pending,
    Accepted,
    Rejected,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn metadata() -> MediaMetadata {
        MediaMetadata {
            kind: MediaKind::Video,
            title: "Fixture local".into(),
            mime_type: Some("video/mp4".into()),
            width: Some(1280),
            height: Some(720),
            frame_rate_milli: None,
            video_codec: None,
            audio_codec: None,
            video_tracks: None,
            audio_tracks: None,
            duration_ms: Some("12500".into()),
            size_bytes: Some("18446744073709551615".into()),
            size_kind: MediaSizeKind::Exact,
            manifest_kind: MediaManifestKind::None,
        }
    }

    #[test]
    fn media_metadata_accepts_only_bounded_known_values() {
        assert_eq!(metadata().validate(), Ok(()));
        assert_eq!(
            MediaMetadata {
                size_kind: MediaSizeKind::Unknown,
                size_bytes: None,
                ..metadata()
            }
            .validate(),
            Ok(())
        );
        for invalid in [
            MediaMetadata {
                title: "x\nsecret".into(),
                ..metadata()
            },
            MediaMetadata {
                width: Some(16_385),
                ..metadata()
            },
            MediaMetadata {
                frame_rate_milli: Some(1_000_001),
                ..metadata()
            },
            MediaMetadata {
                duration_ms: Some("1e4".into()),
                ..metadata()
            },
            MediaMetadata {
                size_bytes: Some("18446744073709551616".into()),
                ..metadata()
            },
            MediaMetadata {
                size_kind: MediaSizeKind::Unknown,
                ..metadata()
            },
            MediaMetadata {
                manifest_kind: MediaManifestKind::Hls,
                ..metadata()
            },
            MediaMetadata {
                mime_type: Some("video/mp4\r\nset-cookie:x".into()),
                ..metadata()
            },
            MediaMetadata {
                mime_type: Some("video/audio/mp4".into()),
                ..metadata()
            },
        ] {
            assert_eq!(invalid.validate(), Err(crate::DownloadError::InvalidInput));
        }
    }

    #[test]
    fn capture_debug_never_discloses_url_filename_or_title() {
        let proposal = CaptureProposal {
            id: "media-1".into(),
            url: "https://cdn.invalid/secret?token=private".into(),
            name: "private-session.mp4".into(),
            source: "media".into(),
            media: Some(MediaMetadata {
                title: "Private tab title".into(),
                ..metadata()
            }),
        };
        let output = format!("{proposal:?}");
        assert!(!output.contains("token=private"));
        assert!(!output.contains("private-session.mp4"));
        assert!(!output.contains("Private tab title"));
    }
}
