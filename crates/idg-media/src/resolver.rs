use crate::{dash, hls};
use idg_core::download::{Control, MediaSegment, MediaTask, resources::Resources};
use idg_protocol::{
    DownloadError, MediaAudioOption, MediaManifestKind, MediaOutput, MediaPlan, MediaSelection,
    MediaVariantOption,
};
use reqwest::{Client, Response, Url, header};
use sha2::{Digest, Sha256};
use std::{sync::Arc, time::Duration};
use tokio::sync::watch;

const MAX_MANIFEST_REDIRECTS: usize = 5;
const MAX_AUDIO_GROUPS: usize = 100;

enum Source {
    Hls(HlsSource),
    Dash(DashSource),
}

struct HlsSource {
    master: Option<hls::HlsMasterPlaylist>,
    media: Option<hls::HlsMediaPlaylist>,
}

struct DashSource {
    manifest: dash::DashManifest,
    video_indices: Vec<usize>,
    audio_indices: Vec<usize>,
}

pub struct ResolvedMedia {
    pub plan: MediaPlan,
    source: Source,
}

pub async fn inspect_manifest(
    client: &Client,
    url: &str,
    resources: &Arc<Resources>,
    request_id: &str,
) -> Result<MediaPlan, DownloadError> {
    Ok(resolve(client, url, resources, request_id).await?.plan)
}

pub async fn prepare_selection(
    client: &Client,
    url: &str,
    fingerprint: &str,
    selection: &MediaSelection,
    resources: &Arc<Resources>,
    job_id: &str,
) -> Result<MediaTask, DownloadError> {
    let resolved = resolve(client, url, resources, job_id).await?;
    if resolved.plan.fingerprint != fingerprint {
        return Err(DownloadError::ResourceChanged);
    }
    resolved.plan.validate_selection(selection)?;

    let (kind, main_urls, audio_urls, main_has_audio, duration_ms) = match resolved.source {
        Source::Hls(source) => {
            let (main_urls, group) = match source.master {
                Some(master) => {
                    let variant_index =
                        selection.variant_index.ok_or(DownloadError::InvalidInput)? as usize;
                    let variant = master
                        .variants
                        .get(variant_index)
                        .ok_or(DownloadError::InvalidInput)?;
                    let rendition = selection
                        .audio_track_index
                        .map(|index| {
                            master
                                .audio_renditions
                                .get(index as usize)
                                .cloned()
                                .ok_or(DownloadError::InvalidInput)
                        })
                        .transpose()?;
                    if let Some(rendition) = &rendition
                        && variant.audio_group.as_deref() != Some(rendition.group_id.as_str())
                    {
                        return Err(DownloadError::InvalidInput);
                    }
                    (variant.uri.clone(), rendition)
                }
                None => {
                    if selection.variant_index != Some(0) || selection.audio_track_index.is_some() {
                        return Err(DownloadError::InvalidInput);
                    }
                    let media = source.media.as_ref().ok_or(DownloadError::Representation)?;
                    return Ok(MediaTask {
                        kind: MediaManifestKind::Hls,
                        fingerprint: resolved.plan.fingerprint,
                        selection: selection.clone(),
                        main_is_video: true,
                        main_has_audio: false,
                        main_segments: urls_to_segments(hls_urls(media)),
                        audio_segments: Vec::new(),
                        duration_ms: millis(media.duration),
                        stage: idg_protocol::MediaStage::Downloading,
                    });
                }
            };
            let variant_url = main_urls;
            let (text, final_url) = fetch_text(client, &variant_url, resources, job_id).await?;
            let media = hls::parse_media_playlist(&text, &final_url)
                .map_err(|_| DownloadError::Representation)?;
            let audio = match group.as_ref() {
                Some(rendition) => match rendition.uri.as_deref() {
                    Some(audio_url) => {
                        let (text, final_url) =
                            fetch_text(client, audio_url, resources, job_id).await?;
                        let audio_playlist = hls::parse_media_playlist(&text, &final_url)
                            .map_err(|_| DownloadError::Representation)?;
                        hls_urls(&audio_playlist)
                    }
                    None => Vec::new(),
                },
                None => Vec::new(),
            };
            let main_has_audio = group
                .as_ref()
                .is_some_and(|rendition| rendition.uri.is_none())
                || selection
                    .variant_index
                    .and_then(|index| resolved.plan.variants.get(index as usize))
                    .is_some_and(|variant| {
                        variant.codecs.iter().any(|codec| is_audio_codec(codec))
                    });
            let main_urls = hls_urls(&media);
            (
                MediaManifestKind::Hls,
                main_urls,
                audio,
                main_has_audio,
                resolved.plan.duration_ms.or_else(|| millis(media.duration)),
            )
        }
        Source::Dash(source) => {
            let variant = selection
                .variant_index
                .map(|index| {
                    source
                        .video_indices
                        .get(index as usize)
                        .and_then(|track| source.manifest.tracks.get(*track))
                        .ok_or(DownloadError::InvalidInput)
                })
                .transpose()?;
            let audio = selection
                .audio_track_index
                .map(|index| {
                    source
                        .audio_indices
                        .get(index as usize)
                        .and_then(|track| source.manifest.tracks.get(*track))
                        .ok_or(DownloadError::InvalidInput)
                })
                .transpose()?;
            (
                MediaManifestKind::Dash,
                variant.map(track_urls).unwrap_or_default(),
                audio.map(track_urls).unwrap_or_default(),
                false,
                millis(source.manifest.duration),
            )
        }
    };

    if main_urls.is_empty() && audio_urls.is_empty() {
        return Err(DownloadError::Representation);
    }
    let audio_only = matches!(
        selection.output,
        MediaOutput::Mp3 | MediaOutput::Aac | MediaOutput::Flac | MediaOutput::AudioOriginal
    );
    if audio_only && audio_urls.is_empty() && !main_has_audio {
        return Err(DownloadError::InvalidInput);
    }
    let (main_urls, audio_urls) = if audio_only && !audio_urls.is_empty() {
        (Vec::new(), audio_urls)
    } else {
        (main_urls, audio_urls)
    };

    Ok(MediaTask {
        kind,
        fingerprint: resolved.plan.fingerprint,
        selection: selection.clone(),
        main_is_video: !audio_only && !main_urls.is_empty(),
        main_has_audio: audio_urls.is_empty() && main_has_audio,
        main_segments: urls_to_segments(main_urls),
        audio_segments: urls_to_segments(audio_urls),
        duration_ms,
        stage: idg_protocol::MediaStage::Downloading,
    })
}

async fn resolve(
    client: &Client,
    raw_url: &str,
    resources: &Arc<Resources>,
    request_id: &str,
) -> Result<ResolvedMedia, DownloadError> {
    let url = safe_manifest_url(raw_url)?;
    let (bytes, manifest_url) =
        fetch_limited(client, url.as_str(), resources, request_id, 4 * 1024 * 1024).await?;
    let fingerprint = format!("{:x}", Sha256::digest(&bytes));
    let text = std::str::from_utf8(&bytes).map_err(|_| DownloadError::Representation)?;

    if text.trim_start_matches('\u{feff}').starts_with("#EXTM3U") {
        let parsed =
            hls::parse_playlist(text, &manifest_url).map_err(|_| DownloadError::Representation)?;
        match parsed {
            hls::HlsPlaylist::Master(master) => {
                if master.variants.len() > 100 || master.audio_renditions.len() > MAX_AUDIO_GROUPS {
                    return Err(DownloadError::Representation);
                }
                let variants = master
                    .variants
                    .iter()
                    .enumerate()
                    .map(|(index, variant)| MediaVariantOption {
                        index: index as u32,
                        label: variant
                            .resolution
                            .map(|(width, height)| format!("{height}p · {width}×{height}"))
                            .unwrap_or_else(|| format!("Variante {}", index + 1)),
                        bandwidth_bps: Some(variant.average_bandwidth.unwrap_or(variant.bandwidth)),
                        width: variant.resolution.map(|(width, _)| width),
                        height: variant.resolution.map(|(_, height)| height),
                        codecs: variant
                            .codecs
                            .as_deref()
                            .map(|codecs| {
                                codecs
                                    .split(',')
                                    .map(str::trim)
                                    .map(str::to_owned)
                                    .collect()
                            })
                            .unwrap_or_default(),
                        audio_group: variant.audio_group.clone(),
                        has_video: true,
                    })
                    .collect();
                let audio_tracks = master
                    .audio_renditions
                    .iter()
                    .enumerate()
                    .map(|(index, track)| MediaAudioOption {
                        index: index as u32,
                        group: Some(track.group_id.clone()),
                        label: track.name.clone(),
                        language: track.language.clone(),
                        is_default: track.default,
                        channels: None,
                        external: track.uri.is_some(),
                    })
                    .collect();
                Ok(ResolvedMedia {
                    plan: MediaPlan {
                        kind: MediaManifestKind::Hls,
                        fingerprint,
                        variants,
                        audio_tracks,
                        duration_ms: None,
                    },
                    source: Source::Hls(HlsSource {
                        master: Some(master),
                        media: None,
                    }),
                })
            }
            hls::HlsPlaylist::Media(media) => Ok(ResolvedMedia {
                plan: MediaPlan {
                    kind: MediaManifestKind::Hls,
                    fingerprint,
                    variants: vec![MediaVariantOption {
                        index: 0,
                        label: "Flujo VOD del manifiesto".into(),
                        bandwidth_bps: None,
                        width: None,
                        height: None,
                        codecs: Vec::new(),
                        audio_group: None,
                        has_video: true,
                    }],
                    audio_tracks: Vec::new(),
                    duration_ms: millis(media.duration),
                },
                source: Source::Hls(HlsSource {
                    master: None,
                    media: Some(media),
                }),
            }),
        }
    } else {
        let manifest =
            dash::parse_mpd(&bytes, &manifest_url).map_err(|_| DownloadError::Representation)?;
        if manifest.tracks.len() > 500 {
            return Err(DownloadError::Representation);
        }
        let video_indices = manifest
            .tracks
            .iter()
            .enumerate()
            .filter_map(|(index, track)| (track.kind == dash::TrackKind::Video).then_some(index))
            .collect::<Vec<_>>();
        let audio_indices = manifest
            .tracks
            .iter()
            .enumerate()
            .filter_map(|(index, track)| (track.kind == dash::TrackKind::Audio).then_some(index))
            .collect::<Vec<_>>();
        let variants = video_indices
            .iter()
            .enumerate()
            .map(|(index, track_index)| {
                let track = &manifest.tracks[*track_index];
                MediaVariantOption {
                    index: index as u32,
                    label: track.id.as_ref().map_or_else(
                        || format!("Video {}", index + 1),
                        |id| format!("Video · {id}"),
                    ),
                    bandwidth_bps: track.bandwidth,
                    width: None,
                    height: None,
                    codecs: track.codecs.iter().cloned().collect(),
                    audio_group: None,
                    has_video: true,
                }
            })
            .collect();
        let audio_tracks = audio_indices
            .iter()
            .enumerate()
            .map(|(index, track_index)| {
                let track = &manifest.tracks[*track_index];
                MediaAudioOption {
                    index: index as u32,
                    group: None,
                    label: track.id.as_ref().map_or_else(
                        || format!("Audio {}", index + 1),
                        |id| format!("Audio · {id}"),
                    ),
                    language: None,
                    is_default: index == 0,
                    channels: None,
                    external: true,
                }
            })
            .collect();
        Ok(ResolvedMedia {
            plan: MediaPlan {
                kind: MediaManifestKind::Dash,
                fingerprint,
                variants,
                audio_tracks,
                duration_ms: millis(manifest.duration),
            },
            source: Source::Dash(DashSource {
                manifest,
                video_indices,
                audio_indices,
            }),
        })
    }
}

async fn fetch_text(
    client: &Client,
    url: &str,
    resources: &Arc<Resources>,
    request_id: &str,
) -> Result<(String, String), DownloadError> {
    let (bytes, final_url) =
        fetch_limited(client, url, resources, request_id, 4 * 1024 * 1024).await?;
    Ok((
        String::from_utf8(bytes).map_err(|_| DownloadError::Representation)?,
        final_url,
    ))
}

async fn fetch_limited(
    client: &Client,
    url: &str,
    resources: &Arc<Resources>,
    request_id: &str,
    max_bytes: usize,
) -> Result<(Vec<u8>, String), DownloadError> {
    let mut url = safe_manifest_url(url)?;
    let (_control_tx, mut control) = watch::channel(Control::Run);
    for hop in 0..=MAX_MANIFEST_REDIRECTS {
        let permit = resources
            .acquire(
                request_id,
                &url.origin().ascii_serialization(),
                idg_protocol::Priority::Normal,
                &mut control,
            )
            .await?;
        let response = client
            .get(url.clone())
            .header(header::ACCEPT_ENCODING, "identity")
            .send()
            .await
            .map_err(|error| {
                if error.is_timeout() {
                    DownloadError::Timeout
                } else {
                    DownloadError::Network
                }
            })?;
        if response.status().is_redirection() {
            if hop == MAX_MANIFEST_REDIRECTS {
                return Err(DownloadError::HttpStatus);
            }
            let location = response
                .headers()
                .get(header::LOCATION)
                .and_then(|value| value.to_str().ok())
                .ok_or(DownloadError::HttpStatus)?;
            let next = url.join(location).map_err(|_| DownloadError::HttpStatus)?;
            if !safe_redirect(&url, &next) {
                return Err(DownloadError::AccessDenied);
            }
            drop(permit);
            url = next;
            continue;
        }
        if !response.status().is_success() {
            return Err(DownloadError::HttpStatus);
        }
        let body = response_bytes(response, max_bytes).await?;
        drop(permit);
        return Ok((body, url.to_string()));
    }
    Err(DownloadError::HttpStatus)
}

async fn response_bytes(
    mut response: Response,
    max_bytes: usize,
) -> Result<Vec<u8>, DownloadError> {
    if response
        .content_length()
        .is_some_and(|length| length > max_bytes as u64)
    {
        return Err(DownloadError::Representation);
    }
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|error| {
        if error.is_timeout() {
            DownloadError::Timeout
        } else {
            DownloadError::Network
        }
    })? {
        if body.len().saturating_add(chunk.len()) > max_bytes {
            return Err(DownloadError::Representation);
        }
        body.extend_from_slice(&chunk);
    }
    Ok(body)
}

pub(crate) fn safe_manifest_url(raw: &str) -> Result<Url, DownloadError> {
    if raw.is_empty() || raw.len() > 2048 || raw.chars().any(char::is_control) {
        return Err(DownloadError::InvalidInput);
    }
    let url = Url::parse(raw).map_err(|_| DownloadError::InvalidInput)?;
    if !matches!(url.scheme(), "http" | "https")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(DownloadError::InvalidInput);
    }
    Ok(url)
}

pub(crate) fn safe_redirect(previous: &Url, next: &Url) -> bool {
    matches!(next.scheme(), "http" | "https")
        && next.host_str().is_some()
        && next.username().is_empty()
        && next.password().is_none()
        && next.fragment().is_none()
        && !(previous.scheme() == "https" && next.scheme() != "https")
}

fn hls_urls(playlist: &hls::HlsMediaPlaylist) -> Vec<String> {
    let mut segments = Vec::with_capacity(
        playlist.segments.len() + usize::from(playlist.initialization_uri.is_some()),
    );
    if let Some(url) = &playlist.initialization_uri {
        segments.push(url.clone());
    }
    segments.extend(playlist.segments.iter().map(|segment| segment.uri.clone()));
    segments
}

fn track_urls(track: &dash::DashTrack) -> Vec<String> {
    std::iter::once(track.initialization_url().to_owned())
        .chain(track.segment_urls().iter().cloned())
        .collect()
}

fn urls_to_segments(urls: Vec<String>) -> Vec<MediaSegment> {
    urls.into_iter()
        .map(|url| MediaSegment {
            url,
            retries: 0,
            bytes: None,
            sha256: None,
        })
        .collect()
}

fn millis(duration: Duration) -> Option<u64> {
    u64::try_from(duration.as_millis()).ok()
}

fn is_audio_codec(codec: &str) -> bool {
    let codec = codec.to_ascii_lowercase();
    ["mp4a", "ac-3", "ec-3", "opus", "vorbis", "flac"]
        .iter()
        .any(|prefix| codec.starts_with(prefix))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn manifest_urls_reject_credentials_queries_and_fragments() {
        for url in [
            "ftp://example.test/video.m3u8",
            "https://user:secret@example.test/video.m3u8",
            "https://example.test/video.m3u8?token=secret",
            "https://example.test/video.m3u8#part",
        ] {
            assert_eq!(safe_manifest_url(url), Err(DownloadError::InvalidInput));
        }
    }

    #[test]
    fn redirects_allow_cross_origin_without_credentials_but_never_tls_downgrade() {
        let source = Url::parse("https://one.example/media.m3u8").unwrap();
        let target = Url::parse("https://cdn.example/media.m3u8?token=hidden").unwrap();
        let downgrade = Url::parse("http://cdn.example/media.m3u8").unwrap();
        assert!(safe_redirect(&source, &target));
        assert!(!safe_redirect(&source, &downgrade));
    }
}
