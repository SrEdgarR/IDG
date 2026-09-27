//! Parser puro para un subconjunto acotado de HLS VOD.
//!
//! Acepta variantes, pistas de audio, segmentos `EXTINF`, un `EXT-X-MAP` y
//! metadatos estructurales comunes. No resuelve red ni descarga contenido.

use std::{collections::HashSet, error::Error, fmt, time::Duration};

use url::Url;

pub const MAX_PLAYLIST_BYTES: usize = 4 * 1024 * 1024;
pub const MAX_SEGMENTS: usize = 20_000;
pub const MAX_DURATION: Duration = Duration::from_secs(24 * 60 * 60);

const NANOS_PER_SECOND: u128 = 1_000_000_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HlsError {
    PlaylistTooLarge,
    TooManySegments,
    DurationLimit,
    InvalidPlaylist,
    UnsupportedTag,
    UnsupportedValue,
    Encrypted,
    ByteRange,
    Discontinuity,
    LivePlaylist,
    UnsafeReference,
}

impl fmt::Display for HlsError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::PlaylistTooLarge => "HLS playlist exceeds 4 MiB",
            Self::TooManySegments => "HLS playlist exceeds 20,000 segments",
            Self::DurationLimit => "HLS playlist exceeds 24 hours",
            Self::InvalidPlaylist => "invalid or unsupported HLS playlist structure",
            Self::UnsupportedTag => "HLS playlist contains an unsupported tag",
            Self::UnsupportedValue => "HLS playlist contains an unsupported value",
            Self::Encrypted => "encrypted HLS playlists are unsupported",
            Self::ByteRange => "HLS byte ranges are unsupported",
            Self::Discontinuity => "HLS discontinuities are unsupported",
            Self::LivePlaylist => "live and dynamic HLS playlists are unsupported",
            Self::UnsafeReference => "HLS reference is not a safe HTTP(S) URL",
        })
    }
}

impl Error for HlsError {}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HlsPlaylist {
    Master(HlsMasterPlaylist),
    Media(HlsMediaPlaylist),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HlsMasterPlaylist {
    pub variants: Vec<HlsVariant>,
    pub audio_renditions: Vec<HlsAudioRendition>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HlsVariant {
    pub uri: String,
    pub bandwidth: u64,
    pub average_bandwidth: Option<u64>,
    pub codecs: Option<String>,
    pub resolution: Option<(u32, u32)>,
    pub audio_group: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HlsAudioRendition {
    pub group_id: String,
    pub name: String,
    pub language: Option<String>,
    pub uri: Option<String>,
    pub default: bool,
    pub autoselect: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HlsMediaPlaylist {
    pub initialization_uri: Option<String>,
    pub target_duration: Duration,
    pub segments: Vec<HlsSegment>,
    pub duration: Duration,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HlsSegment {
    pub uri: String,
    pub duration: Duration,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum PlaylistKind {
    Master,
    Media,
}

/// Parses a master playlist or a finite media playlist.
pub fn parse_playlist(input: &str, base_url: &str) -> Result<HlsPlaylist, HlsError> {
    validate_playlist(input)?;
    let kind = classify(input)?;
    let base = safe_base_url(base_url)?;

    match kind {
        PlaylistKind::Master => parse_master_lines(input, &base).map(HlsPlaylist::Master),
        PlaylistKind::Media => parse_media_lines(input, &base).map(HlsPlaylist::Media),
    }
}

/// Parses a master playlist containing variants and optional external audio renditions.
pub fn parse_master_playlist(input: &str, base_url: &str) -> Result<HlsMasterPlaylist, HlsError> {
    match parse_playlist(input, base_url)? {
        HlsPlaylist::Master(playlist) => Ok(playlist),
        HlsPlaylist::Media(_) => Err(HlsError::InvalidPlaylist),
    }
}

/// Parses a finite, unencrypted media playlist ending with `EXT-X-ENDLIST`.
pub fn parse_media_playlist(input: &str, base_url: &str) -> Result<HlsMediaPlaylist, HlsError> {
    match parse_playlist(input, base_url)? {
        HlsPlaylist::Media(playlist) => Ok(playlist),
        HlsPlaylist::Master(_) => Err(HlsError::InvalidPlaylist),
    }
}

fn validate_playlist(input: &str) -> Result<(), HlsError> {
    if input.len() > MAX_PLAYLIST_BYTES
        || input.contains('\u{feff}')
        || input
            .chars()
            .any(|ch| ch.is_control() && ch != '\n' && ch != '\r')
        || input
            .bytes()
            .enumerate()
            .any(|(index, byte)| byte == b'\r' && input.as_bytes().get(index + 1) != Some(&b'\n'))
    {
        return Err(if input.len() > MAX_PLAYLIST_BYTES {
            HlsError::PlaylistTooLarge
        } else {
            HlsError::InvalidPlaylist
        });
    }

    if input.lines().next() != Some("#EXTM3U") {
        return Err(HlsError::InvalidPlaylist);
    }
    Ok(())
}

fn classify(input: &str) -> Result<PlaylistKind, HlsError> {
    let mut kind = None;
    for line in input.lines().skip(1) {
        let Some((name, _)) = extension_tag(line)? else {
            continue;
        };
        let found = match name {
            "#EXT-X-STREAM-INF" | "#EXT-X-MEDIA" => PlaylistKind::Master,
            "#EXTINF"
            | "#EXT-X-TARGETDURATION"
            | "#EXT-X-MEDIA-SEQUENCE"
            | "#EXT-X-PLAYLIST-TYPE"
            | "#EXT-X-MAP"
            | "#EXT-X-BYTERANGE"
            | "#EXT-X-ENDLIST"
            | "#EXT-X-DISCONTINUITY"
            | "#EXT-X-DISCONTINUITY-SEQUENCE" => PlaylistKind::Media,
            _ => continue,
        };
        if kind.is_some_and(|previous| previous != found) {
            return Err(HlsError::InvalidPlaylist);
        }
        kind = Some(found);
    }
    kind.ok_or(HlsError::InvalidPlaylist)
}

fn parse_master_lines(input: &str, base: &Url) -> Result<HlsMasterPlaylist, HlsError> {
    let mut variants = Vec::new();
    let mut audio_renditions = Vec::new();
    let mut audio_names = HashSet::new();
    let mut default_groups = HashSet::new();
    let mut pending_variant: Option<HlsVariant> = None;
    let mut version_seen = false;
    let mut independent_seen = false;

    for line in input.lines().skip(1) {
        if line.is_empty() || is_comment(line) {
            continue;
        }
        if !line.starts_with('#') {
            let Some(mut variant) = pending_variant.take() else {
                return Err(HlsError::InvalidPlaylist);
            };
            variant.uri = resolve_reference(base, line)?;
            variants.push(variant);
            continue;
        }

        let (name, value) = extension_tag(line)?.ok_or(HlsError::InvalidPlaylist)?;
        if pending_variant.is_some() {
            return Err(HlsError::InvalidPlaylist);
        }
        match name {
            "#EXT-X-VERSION" => {
                if version_seen || parse_positive_integer(required_value(value)?)?.is_none() {
                    return Err(HlsError::InvalidPlaylist);
                }
                version_seen = true;
            }
            "#EXT-X-INDEPENDENT-SEGMENTS" => {
                if independent_seen || value.is_some() {
                    return Err(HlsError::InvalidPlaylist);
                }
                independent_seen = true;
            }
            "#EXT-X-STREAM-INF" => {
                let attributes = parse_attributes(required_value(value)?)?;
                let bandwidth = positive_attribute(&attributes, "BANDWIDTH")?;
                let average_bandwidth =
                    optional_positive_attribute(&attributes, "AVERAGE-BANDWIDTH")?;
                let resolution = optional_attribute(&attributes, "RESOLUTION")?
                    .map(parse_resolution)
                    .transpose()?;
                let codecs = optional_attribute(&attributes, "CODECS")?.map(str::to_owned);
                let audio_group = optional_attribute(&attributes, "AUDIO")?.map(str::to_owned);
                for name in ["VIDEO", "SUBTITLES"] {
                    if optional_attribute(&attributes, name)?.is_some() {
                        return Err(HlsError::UnsupportedValue);
                    }
                }
                if optional_attribute(&attributes, "CLOSED-CAPTIONS")?.is_some_and(|v| v != "NONE")
                {
                    return Err(HlsError::UnsupportedValue);
                }
                pending_variant = Some(HlsVariant {
                    uri: String::new(),
                    bandwidth,
                    average_bandwidth,
                    codecs,
                    resolution,
                    audio_group,
                });
            }
            "#EXT-X-MEDIA" => {
                let attributes = parse_attributes(required_value(value)?)?;
                if attribute(&attributes, "TYPE")? != Some("AUDIO") {
                    return Err(HlsError::UnsupportedTag);
                }
                let group_id = required_attribute(&attributes, "GROUP-ID")?.to_owned();
                let name = required_attribute(&attributes, "NAME")?.to_owned();
                let default =
                    parse_yes_no(optional_attribute(&attributes, "DEFAULT")?.unwrap_or("NO"))?;
                let autoselect_attribute = optional_attribute(&attributes, "AUTOSELECT")?;
                let autoselect = parse_yes_no(autoselect_attribute.unwrap_or("NO"))?;
                if default && autoselect_attribute == Some("NO") {
                    return Err(HlsError::InvalidPlaylist);
                }
                let language = optional_attribute(&attributes, "LANGUAGE")?.map(str::to_owned);
                let uri = optional_attribute(&attributes, "URI")?
                    .map(|reference| resolve_reference(base, reference))
                    .transpose()?;
                if !audio_names.insert((group_id.clone(), name.clone()))
                    || (default && !default_groups.insert(group_id.clone()))
                {
                    return Err(HlsError::InvalidPlaylist);
                }
                audio_renditions.push(HlsAudioRendition {
                    group_id,
                    name,
                    language,
                    uri,
                    default,
                    autoselect,
                });
            }
            "#EXT-X-KEY" => {
                validate_clear_key(value)?;
                return Err(HlsError::UnsupportedTag);
            }
            "#EXT-X-BYTERANGE" => return Err(HlsError::ByteRange),
            "#EXT-X-DISCONTINUITY" | "#EXT-X-DISCONTINUITY-SEQUENCE" => {
                return Err(HlsError::Discontinuity);
            }
            _ => return Err(HlsError::UnsupportedTag),
        }
    }

    if pending_variant.is_some() || variants.is_empty() {
        return Err(HlsError::InvalidPlaylist);
    }
    let audio_groups = audio_renditions
        .iter()
        .map(|rendition| rendition.group_id.as_str())
        .collect::<HashSet<_>>();
    if variants.iter().any(|variant| {
        variant
            .audio_group
            .as_deref()
            .is_some_and(|group| !audio_groups.contains(group))
    }) {
        return Err(HlsError::InvalidPlaylist);
    }

    Ok(HlsMasterPlaylist {
        variants,
        audio_renditions,
    })
}

fn parse_media_lines(input: &str, base: &Url) -> Result<HlsMediaPlaylist, HlsError> {
    let mut target_duration: Option<Duration> = None;
    let mut initialization_uri = None;
    let mut segments = Vec::new();
    let mut total_nanos = 0u128;
    let mut pending_duration: Option<Duration> = None;
    let mut end_list = false;
    let mut version_seen = false;
    let mut media_sequence_seen = false;
    let mut playlist_type_seen = false;
    let mut independent_seen = false;

    for line in input.lines().skip(1) {
        if line.is_empty() || is_comment(line) {
            continue;
        }
        if end_list {
            return Err(HlsError::InvalidPlaylist);
        }
        if !line.starts_with('#') {
            let Some(duration) = pending_duration.take() else {
                return Err(HlsError::InvalidPlaylist);
            };
            if segments.len() == MAX_SEGMENTS {
                return Err(HlsError::TooManySegments);
            }
            let uri = resolve_reference(base, line)?;
            total_nanos = total_nanos
                .checked_add(duration.as_nanos())
                .ok_or(HlsError::DurationLimit)?;
            if total_nanos > MAX_DURATION.as_nanos() {
                return Err(HlsError::DurationLimit);
            }
            if target_duration
                .is_some_and(|target| rounded_seconds(duration) > target.as_secs() as u128)
            {
                return Err(HlsError::InvalidPlaylist);
            }
            segments.push(HlsSegment { uri, duration });
            continue;
        }

        let (name, value) = extension_tag(line)?.ok_or(HlsError::InvalidPlaylist)?;
        if pending_duration.is_some() {
            return Err(HlsError::InvalidPlaylist);
        }
        match name {
            "#EXTINF" => {
                if pending_duration.is_some() {
                    return Err(HlsError::InvalidPlaylist);
                }
                let value = required_value(value)?;
                let (duration, _) = value.split_once(',').ok_or(HlsError::InvalidPlaylist)?;
                pending_duration = Some(parse_duration(duration)?);
            }
            "#EXT-X-TARGETDURATION" => {
                if target_duration.is_some() || !segments.is_empty() {
                    return Err(HlsError::InvalidPlaylist);
                }
                let seconds = parse_positive_integer(required_value(value)?)?
                    .ok_or(HlsError::InvalidPlaylist)?;
                target_duration = Some(Duration::from_secs(seconds));
            }
            "#EXT-X-VERSION" => {
                if version_seen || !segments.is_empty() {
                    return Err(HlsError::InvalidPlaylist);
                }
                parse_positive_integer(required_value(value)?)?;
                version_seen = true;
            }
            "#EXT-X-MEDIA-SEQUENCE" => {
                if media_sequence_seen || !segments.is_empty() {
                    return Err(HlsError::InvalidPlaylist);
                }
                parse_unsigned_integer(required_value(value)?)?;
                media_sequence_seen = true;
            }
            "#EXT-X-PLAYLIST-TYPE" => {
                if playlist_type_seen || !segments.is_empty() {
                    return Err(HlsError::InvalidPlaylist);
                }
                playlist_type_seen = true;
                match required_value(value)? {
                    "VOD" => {}
                    "EVENT" => return Err(HlsError::LivePlaylist),
                    _ => return Err(HlsError::UnsupportedValue),
                }
            }
            "#EXT-X-MAP" => {
                if pending_duration.is_some()
                    || !segments.is_empty()
                    || initialization_uri.is_some()
                {
                    return Err(HlsError::InvalidPlaylist);
                }
                let attributes = parse_attributes(required_value(value)?)?;
                if attribute(&attributes, "BYTERANGE")?.is_some() {
                    return Err(HlsError::ByteRange);
                }
                let reference = required_attribute(&attributes, "URI")?;
                initialization_uri = Some(resolve_reference(base, reference)?);
            }
            "#EXT-X-KEY" => validate_clear_key(value)?,
            "#EXT-X-ENDLIST" => {
                if pending_duration.is_some() || value.is_some() {
                    return Err(HlsError::InvalidPlaylist);
                }
                end_list = true;
            }
            "#EXT-X-INDEPENDENT-SEGMENTS" => {
                if independent_seen || value.is_some() {
                    return Err(HlsError::InvalidPlaylist);
                }
                independent_seen = true;
            }
            "#EXT-X-BYTERANGE" => return Err(HlsError::ByteRange),
            "#EXT-X-DISCONTINUITY" | "#EXT-X-DISCONTINUITY-SEQUENCE" => {
                return Err(HlsError::Discontinuity);
            }
            _ => return Err(HlsError::UnsupportedTag),
        }
    }

    if !end_list {
        return Err(HlsError::LivePlaylist);
    }
    if pending_duration.is_some() || segments.is_empty() {
        return Err(HlsError::InvalidPlaylist);
    }
    let target_duration = target_duration.ok_or(HlsError::InvalidPlaylist)?;

    Ok(HlsMediaPlaylist {
        initialization_uri,
        target_duration,
        segments,
        duration: Duration::from_nanos(total_nanos as u64),
    })
}

fn extension_tag(line: &str) -> Result<Option<(&str, Option<&str>)>, HlsError> {
    if !line.starts_with('#') || !line.starts_with("#EXT") {
        return Ok(None);
    }
    let (name, value) = match line.split_once(':') {
        Some((name, value)) => (name, Some(value)),
        None => (line, None),
    };
    if name == "#EXTM3U" && value.is_none() {
        return Err(HlsError::InvalidPlaylist);
    }
    Ok(Some((name, value)))
}

fn required_value(value: Option<&str>) -> Result<&str, HlsError> {
    value.ok_or(HlsError::InvalidPlaylist)
}

fn is_comment(line: &str) -> bool {
    line.starts_with('#') && !line.starts_with("#EXT")
}

fn safe_base_url(base: &str) -> Result<Url, HlsError> {
    if !safe_url_text(base) || base.contains(['?', '#']) || has_userinfo(base) {
        return Err(HlsError::UnsafeReference);
    }
    let url = Url::parse(base).map_err(|_| HlsError::UnsafeReference)?;
    if !is_http_url(&url)
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(HlsError::UnsafeReference);
    }
    Ok(url)
}

fn resolve_reference(base: &Url, reference: &str) -> Result<String, HlsError> {
    if reference.is_empty()
        || !safe_url_text(reference)
        || reference.contains(['?', '#'])
        || has_userinfo(reference)
        || has_unsupported_scheme(reference)
    {
        return Err(HlsError::UnsafeReference);
    }
    let url = base
        .join(reference)
        .map_err(|_| HlsError::UnsafeReference)?;
    if !is_http_url(&url)
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(HlsError::UnsafeReference);
    }
    Ok(url.into())
}

fn safe_url_text(value: &str) -> bool {
    !value
        .chars()
        .any(|ch| ch.is_whitespace() || ch.is_control() || ch == '\\')
}

fn is_http_url(url: &Url) -> bool {
    matches!(url.scheme(), "http" | "https") && url.host_str().is_some()
}

fn has_userinfo(value: &str) -> bool {
    let authority = ["https://", "http://"]
        .into_iter()
        .find_map(|scheme| {
            value
                .get(..scheme.len())
                .is_some_and(|prefix| prefix.eq_ignore_ascii_case(scheme))
                .then(|| &value[scheme.len()..])
        })
        .or_else(|| value.strip_prefix("//"));
    authority.is_some_and(|rest| {
        rest.split('/')
            .next()
            .is_some_and(|host| host.contains('@'))
    })
}

fn has_unsupported_scheme(reference: &str) -> bool {
    let first_segment = reference.split('/').next().unwrap_or_default();
    let supported_scheme = ["http://", "https://"].into_iter().any(|scheme| {
        reference
            .get(..scheme.len())
            .is_some_and(|prefix| prefix.eq_ignore_ascii_case(scheme))
    });
    first_segment.contains(':') && !supported_scheme
}

fn parse_attributes(input: &str) -> Result<Vec<(&str, &str)>, HlsError> {
    let bytes = input.as_bytes();
    let mut attributes = Vec::new();
    let mut names = HashSet::new();
    let mut index = 0;

    while index < bytes.len() {
        let key_start = index;
        while index < bytes.len()
            && (bytes[index].is_ascii_uppercase()
                || bytes[index].is_ascii_digit()
                || bytes[index] == b'-')
        {
            index += 1;
        }
        if index == key_start || bytes.get(index) != Some(&b'=') {
            return Err(HlsError::InvalidPlaylist);
        }
        let key_slice = &input[key_start..index];
        index += 1;
        let quoted = bytes.get(index) == Some(&b'"');
        if quoted {
            index += 1;
        }
        let value_start = index;
        if quoted {
            while index < bytes.len() && bytes[index] != b'"' {
                index += 1;
            }
            if index == bytes.len() {
                return Err(HlsError::InvalidPlaylist);
            }
        } else {
            while index < bytes.len() && bytes[index] != b',' {
                if bytes[index] == b'"' || bytes[index].is_ascii_whitespace() {
                    return Err(HlsError::InvalidPlaylist);
                }
                index += 1;
            }
        }
        let value = &input[value_start..index];
        if value.is_empty() || !names.insert(key_slice) {
            return Err(HlsError::InvalidPlaylist);
        }
        attributes.push((key_slice, value));
        if quoted {
            index += 1;
        }
        if index == bytes.len() {
            break;
        }
        if bytes[index] != b',' {
            return Err(HlsError::InvalidPlaylist);
        }
        index += 1;
        if index == bytes.len() {
            return Err(HlsError::InvalidPlaylist);
        }
    }
    Ok(attributes)
}

fn attribute<'a>(
    attributes: &'a [(&'a str, &'a str)],
    name: &str,
) -> Result<Option<&'a str>, HlsError> {
    Ok(attributes
        .iter()
        .find(|(key, _)| *key == name)
        .map(|(_, value)| *value))
}

fn optional_attribute<'a>(
    attributes: &'a [(&'a str, &'a str)],
    name: &str,
) -> Result<Option<&'a str>, HlsError> {
    attribute(attributes, name)
}

fn required_attribute<'a>(
    attributes: &'a [(&'a str, &'a str)],
    name: &str,
) -> Result<&'a str, HlsError> {
    attribute(attributes, name)?.ok_or(HlsError::InvalidPlaylist)
}

fn positive_attribute(attributes: &[(&str, &str)], name: &str) -> Result<u64, HlsError> {
    parse_positive_integer(required_attribute(attributes, name)?)?.ok_or(HlsError::InvalidPlaylist)
}

fn optional_positive_attribute(
    attributes: &[(&str, &str)],
    name: &str,
) -> Result<Option<u64>, HlsError> {
    optional_attribute(attributes, name)?
        .map(|value| parse_positive_integer(value)?.ok_or(HlsError::InvalidPlaylist))
        .transpose()
}

fn parse_positive_integer(value: &str) -> Result<Option<u64>, HlsError> {
    let number = parse_unsigned_integer(value)?;
    Ok((number > 0).then_some(number))
}

fn parse_unsigned_integer(value: &str) -> Result<u64, HlsError> {
    if value.is_empty() || !value.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err(HlsError::InvalidPlaylist);
    }
    value.parse().map_err(|_| HlsError::InvalidPlaylist)
}

fn parse_resolution(value: &str) -> Result<(u32, u32), HlsError> {
    let (width, height) = value.split_once('x').ok_or(HlsError::InvalidPlaylist)?;
    let width = parse_unsigned_integer(width).map_err(|_| HlsError::InvalidPlaylist)?;
    let height = parse_unsigned_integer(height).map_err(|_| HlsError::InvalidPlaylist)?;
    if width == 0 || height == 0 {
        return Err(HlsError::InvalidPlaylist);
    }
    Ok((
        u32::try_from(width).map_err(|_| HlsError::InvalidPlaylist)?,
        u32::try_from(height).map_err(|_| HlsError::InvalidPlaylist)?,
    ))
}

fn parse_yes_no(value: &str) -> Result<bool, HlsError> {
    match value {
        "YES" => Ok(true),
        "NO" => Ok(false),
        _ => Err(HlsError::InvalidPlaylist),
    }
}

fn validate_clear_key(value: Option<&str>) -> Result<(), HlsError> {
    let attributes = parse_attributes(value.ok_or(HlsError::InvalidPlaylist)?)?;
    match attribute(&attributes, "METHOD")? {
        Some("NONE") if attributes.len() == 1 => Ok(()),
        Some("NONE") => Err(HlsError::InvalidPlaylist),
        Some(_) => Err(HlsError::Encrypted),
        None => Err(HlsError::InvalidPlaylist),
    }
}

fn parse_duration(value: &str) -> Result<Duration, HlsError> {
    let (seconds, fraction) = value.split_once('.').unwrap_or((value, ""));
    if value.contains('.') && fraction.is_empty() {
        return Err(HlsError::InvalidPlaylist);
    }
    let seconds = parse_unsigned_integer(seconds)? as u128;
    if fraction.len() > 9 || !fraction.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err(HlsError::InvalidPlaylist);
    }
    let fraction = if fraction.is_empty() {
        0
    } else {
        let parsed: u128 = fraction.parse().map_err(|_| HlsError::InvalidPlaylist)?;
        parsed * 10u128.pow((9 - fraction.len()) as u32)
    };
    let nanos = seconds
        .checked_mul(NANOS_PER_SECOND)
        .and_then(|whole| whole.checked_add(fraction))
        .ok_or(HlsError::DurationLimit)?;
    if nanos > MAX_DURATION.as_nanos() {
        return Err(HlsError::DurationLimit);
    }
    Ok(Duration::from_nanos(nanos as u64))
}

fn rounded_seconds(duration: Duration) -> u128 {
    (duration.as_nanos() + NANOS_PER_SECOND / 2) / NANOS_PER_SECOND
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use super::{
        HlsError, HlsPlaylist, MAX_DURATION, MAX_PLAYLIST_BYTES, MAX_SEGMENTS,
        parse_master_playlist, parse_media_playlist, parse_playlist,
    };

    const MEDIA_URL: &str = "https://media.example/vod/index.m3u8";

    #[test]
    fn parses_vod_map_and_resolves_relative_segments() {
        let input = "#EXTM3U\n#EXT-X-VERSION:6\n#EXT-X-TARGETDURATION:7\n#EXT-X-MAP:URI=\"init.mp4\"\n#EXTINF:6.125,first\nseg-1.m4s\n#EXTINF:5.5,second\n../audio/seg-2.m4s\n#EXT-X-ENDLIST\n";

        let playlist = parse_media_playlist(input, MEDIA_URL).unwrap();

        assert_eq!(
            playlist.initialization_uri.as_deref(),
            Some("https://media.example/vod/init.mp4")
        );
        assert_eq!(playlist.segments.len(), 2);
        assert_eq!(
            playlist.segments[0].uri,
            "https://media.example/vod/seg-1.m4s"
        );
        assert_eq!(
            playlist.segments[1].uri,
            "https://media.example/audio/seg-2.m4s"
        );
        assert_eq!(playlist.duration, Duration::from_millis(11_625));
        assert_eq!(playlist.target_duration, Duration::from_secs(7));
    }

    #[test]
    fn parses_master_variants_and_audio_renditions() {
        let input = "#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID=\"aac\",NAME=\"English\",LANGUAGE=\"en\",DEFAULT=YES,AUTOSELECT=YES,URI=\"//audio.example/en/index.m3u8\"\n#EXT-X-STREAM-INF:BANDWIDTH=800000,AVERAGE-BANDWIDTH=700000,RESOLUTION=1280x720,CODECS=\"avc1.4d401f,mp4a.40.2\",AUDIO=\"aac\"\n../720/index.m3u8\n";

        let playlist = parse_master_playlist(input, "https://media.example/master.m3u8").unwrap();

        assert_eq!(playlist.variants.len(), 1);
        assert_eq!(
            playlist.variants[0].uri,
            "https://media.example/720/index.m3u8"
        );
        assert_eq!(playlist.variants[0].bandwidth, 800_000);
        assert_eq!(playlist.variants[0].average_bandwidth, Some(700_000));
        assert_eq!(playlist.variants[0].resolution, Some((1280, 720)));
        assert_eq!(playlist.variants[0].audio_group.as_deref(), Some("aac"));
        assert_eq!(playlist.audio_renditions.len(), 1);
        assert_eq!(playlist.audio_renditions[0].name, "English");
        assert_eq!(
            playlist.audio_renditions[0].uri.as_deref(),
            Some("https://audio.example/en/index.m3u8")
        );
    }

    #[test]
    fn auto_detects_playlist_kind() {
        let input = "#EXTM3U\n#EXT-X-TARGETDURATION:1\n#EXTINF:1,\na.ts\n#EXT-X-ENDLIST\n";

        assert!(matches!(
            parse_playlist(input, MEDIA_URL).unwrap(),
            HlsPlaylist::Media(_)
        ));
    }

    #[test]
    fn rejects_unsafe_segment_references() {
        for reference in [
            "seg.ts?token=secret",
            "seg.ts#fragment",
            "https://user@media.example/seg.ts",
            "file:///tmp/seg.ts",
            "seg with space.ts",
        ] {
            let input = format!(
                "#EXTM3U\n#EXT-X-TARGETDURATION:1\n#EXTINF:1,\n{reference}\n#EXT-X-ENDLIST\n"
            );
            assert_eq!(
                parse_media_playlist(&input, MEDIA_URL),
                Err(HlsError::UnsafeReference),
                "reference: {reference}"
            );
        }
    }

    #[test]
    fn rejects_unsafe_manifest_urls() {
        let input = "#EXTM3U\n#EXT-X-TARGETDURATION:1\n#EXTINF:1,\na.ts\n#EXT-X-ENDLIST\n";

        for base in [
            "https://user@media.example/index.m3u8",
            "https://media.example/index.m3u8?token=secret",
            "https://media.example/index.m3u8#fragment",
        ] {
            assert_eq!(
                parse_media_playlist(input, base),
                Err(HlsError::UnsafeReference),
                "base: {base}"
            );
        }
    }

    #[test]
    fn rejects_encryption_ranges_discontinuities_dynamic_and_unknown_tags() {
        let cases = [
            (
                "#EXT-X-KEY:METHOD=AES-128,URI=\"key.bin\"\n",
                HlsError::Encrypted,
            ),
            ("#EXT-X-BYTERANGE:100@0\n", HlsError::ByteRange),
            ("#EXT-X-DISCONTINUITY\n", HlsError::Discontinuity),
            ("#EXT-X-GAP\n", HlsError::UnsupportedTag),
            ("#EXT-X-PLAYLIST-TYPE:EVENT\n", HlsError::LivePlaylist),
        ];

        for (tag, error) in cases {
            let input = format!(
                "#EXTM3U\n#EXT-X-TARGETDURATION:1\n{tag}#EXTINF:1,\na.ts\n#EXT-X-ENDLIST\n"
            );
            assert_eq!(parse_media_playlist(&input, MEDIA_URL), Err(error));
        }

        let mapped_range = "#EXTM3U\n#EXT-X-TARGETDURATION:1\n#EXT-X-MAP:URI=\"init.mp4\",BYTERANGE=\"5@0\"\n#EXTINF:1,\na.ts\n#EXT-X-ENDLIST\n";
        assert_eq!(
            parse_media_playlist(mapped_range, MEDIA_URL),
            Err(HlsError::ByteRange)
        );

        let live = "#EXTM3U\n#EXT-X-TARGETDURATION:1\n#EXTINF:1,\na.ts\n";
        assert_eq!(
            parse_media_playlist(live, MEDIA_URL),
            Err(HlsError::LivePlaylist)
        );
    }

    #[test]
    fn allows_only_the_explicit_unencrypted_key_marker() {
        let input = "#EXTM3U\n#EXT-X-TARGETDURATION:1\n#EXT-X-KEY:METHOD=NONE\n#EXTINF:1,\na.ts\n#EXT-X-ENDLIST\n";

        assert!(parse_media_playlist(input, MEDIA_URL).is_ok());
    }

    #[test]
    fn caps_playlist_bytes_segments_and_total_duration() {
        let oversized = format!("#EXTM3U\n{}", "x".repeat(MAX_PLAYLIST_BYTES));
        assert_eq!(
            parse_media_playlist(&oversized, MEDIA_URL),
            Err(HlsError::PlaylistTooLarge)
        );

        let mut at_byte_limit =
            String::from("#EXTM3U\n#EXT-X-TARGETDURATION:1\n#EXTINF:1,\na.ts\n#EXT-X-ENDLIST\n#");
        at_byte_limit.push_str(&"x".repeat(MAX_PLAYLIST_BYTES - at_byte_limit.len()));
        assert_eq!(at_byte_limit.len(), MAX_PLAYLIST_BYTES);
        assert!(parse_media_playlist(&at_byte_limit, MEDIA_URL).is_ok());

        let mut many = String::from("#EXTM3U\n#EXT-X-TARGETDURATION:1\n");
        for index in 0..=MAX_SEGMENTS {
            many.push_str(&format!("#EXTINF:0,\ns{index}.ts\n"));
        }
        many.push_str("#EXT-X-ENDLIST\n");
        assert_eq!(
            parse_media_playlist(&many, MEDIA_URL),
            Err(HlsError::TooManySegments)
        );

        let exactly_24_hours =
            "#EXTM3U\n#EXT-X-TARGETDURATION:86400\n#EXTINF:86400,\na.ts\n#EXT-X-ENDLIST\n"
                .to_string();
        let playlist = parse_media_playlist(&exactly_24_hours, MEDIA_URL).unwrap();
        assert_eq!(playlist.duration, MAX_DURATION);

        let too_long = "#EXTM3U\n#EXT-X-TARGETDURATION:86401\n#EXTINF:86400.000000001,\na.ts\n#EXT-X-ENDLIST\n";
        assert_eq!(
            parse_media_playlist(too_long, MEDIA_URL),
            Err(HlsError::DurationLimit)
        );
    }

    #[test]
    fn rejects_audio_groups_without_a_matching_rendition() {
        let input = "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=800000,AUDIO=\"missing\"\nvariant.m3u8\n";

        assert_eq!(
            parse_master_playlist(input, "https://media.example/master.m3u8"),
            Err(HlsError::InvalidPlaylist)
        );
    }

    #[test]
    fn default_audio_may_omit_autoselect_but_cannot_explicitly_disable_it() {
        let valid = "#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID=\"aac\",NAME=\"English\",DEFAULT=YES,URI=\"audio.m3u8\"\n#EXT-X-STREAM-INF:BANDWIDTH=800000,AUDIO=\"aac\"\nvariant.m3u8\n";
        assert!(parse_master_playlist(valid, "https://media.example/master.m3u8").is_ok());

        let invalid = "#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID=\"aac\",NAME=\"English\",DEFAULT=YES,AUTOSELECT=NO,URI=\"audio.m3u8\"\n#EXT-X-STREAM-INF:BANDWIDTH=800000,AUDIO=\"aac\"\nvariant.m3u8\n";
        assert_eq!(
            parse_master_playlist(invalid, "https://media.example/master.m3u8"),
            Err(HlsError::InvalidPlaylist)
        );
    }
}
