//! Parser acotado para MPD DASH estático.
//!
//! Solo acepta un Period y listas explícitas de segmentos para pistas audio/video.
//! No realiza I/O. Las URLs se resuelven contra `BaseURL` heredados y se mantienen
//! fuera de `Debug` y de los errores.

use quick_xml::events::{BytesStart, Event};
use quick_xml::reader::Reader;
use std::fmt;
use std::sync::Arc;
use std::time::Duration;
use url::Url;

const MAX_XML_BYTES: usize = 4 * 1024 * 1024;
const MAX_XML_DEPTH: usize = 16;
const MAX_XML_ELEMENTS: usize = 100_000;
const MAX_SEGMENTS: usize = 20_000;
const MAX_NAME_BYTES: usize = 128;
const MAX_ATTRIBUTE_BYTES: usize = 2_048;
const MAX_URL_BYTES: usize = 2_048;
const MAX_TRACK_TEXT_BYTES: usize = 1_024;
const MAX_DURATION_NANOS: u128 = 86_400_000_000_000;
const NANOS_PER_SECOND: u128 = 1_000_000_000;
const DASH_NAMESPACE: &str = "urn:mpeg:dash:schema:mpd:2011";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum TrackKind {
    Audio,
    Video,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DashManifest {
    /// Duración declarada del Period. Las listas con `SegmentList@duration` se
    /// comprueban contra este valor; el parser no inspecciona los bytes descargados.
    pub duration: Duration,
    pub tracks: Vec<DashTrack>,
}

#[derive(Clone, Eq, PartialEq)]
pub struct DashTrack {
    pub kind: TrackKind,
    pub id: Option<String>,
    pub mime_type: Option<String>,
    pub codecs: Option<String>,
    pub bandwidth: Option<u64>,
    initialization_url: String,
    segment_urls: Vec<String>,
}

impl DashTrack {
    pub fn initialization_url(&self) -> &str {
        &self.initialization_url
    }

    pub fn segment_urls(&self) -> &[String] {
        &self.segment_urls
    }
}

impl fmt::Debug for DashTrack {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("DashTrack")
            .field("kind", &self.kind)
            .field("id", &self.id.as_ref().map(|_| "<redacted>"))
            .field("mime_type", &self.mime_type.as_ref().map(|_| "<redacted>"))
            .field("codecs", &self.codecs.as_ref().map(|_| "<redacted>"))
            .field("bandwidth", &self.bandwidth)
            .field("initialization_url", &"<redacted>")
            .field("segment_count", &self.segment_urls.len())
            .finish()
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum DashError {
    InputTooLarge,
    TooDeep,
    TooManyElements,
    TooManySegments,
    MalformedXml,
    UnsupportedXml,
    UnsupportedStructure,
    InvalidManifest,
    InvalidDuration,
    DurationExceeded,
    InvalidUrl,
}

impl fmt::Display for DashError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::InputTooLarge => "el MPD supera el límite de tamaño",
            Self::TooDeep => "el MPD supera el límite de profundidad",
            Self::TooManyElements => "el MPD supera el límite de elementos",
            Self::TooManySegments => "el MPD supera el límite de segmentos",
            Self::MalformedXml => "el XML del MPD no es válido",
            Self::UnsupportedXml => "el MPD usa una función XML no admitida",
            Self::UnsupportedStructure => "el MPD contiene una estructura no admitida",
            Self::InvalidManifest => "el MPD no describe una lista estática válida",
            Self::InvalidDuration => "el MPD contiene una duración no válida",
            Self::DurationExceeded => "la duración del MPD supera 24 horas",
            Self::InvalidUrl => "el MPD contiene una URL no admitida",
        })
    }
}

impl std::error::Error for DashError {}

/// Parsea un MPD estático UTF-8 de un solo Period.
///
/// Requiere duraciones declaradas de hasta 24 horas, una SegmentList explícita
/// por pista efectiva y URLs HTTP(S) sin credenciales, query ni fragmento. Una
/// lista se hereda si los niveles inferiores no la redefinen; varias listas en
/// distintos niveles se rechazan porque este parser no las concatena.
pub fn parse_mpd(xml: &[u8], manifest_url: &str) -> Result<DashManifest, DashError> {
    if xml.len() > MAX_XML_BYTES {
        return Err(DashError::InputTooLarge);
    }
    let xml = std::str::from_utf8(xml).map_err(|_| DashError::MalformedXml)?;
    let xml = xml.strip_prefix('\u{feff}').unwrap_or(xml);
    let root = parse_xml(xml)?;
    if root.name != "MPD" {
        return Err(DashError::InvalidManifest);
    }
    if root.attr("xmlns") != Some(DASH_NAMESPACE) {
        return Err(DashError::UnsupportedXml);
    }
    check_attributes(
        &root,
        &[
            "id",
            "profiles",
            "type",
            "mediaPresentationDuration",
            "minBufferTime",
        ],
    )?;
    ensure_whitespace_text(&root)?;
    if root.attr("type").is_some_and(|value| value != "static") {
        return Err(DashError::UnsupportedStructure);
    }

    let root_duration = root
        .attr("mediaPresentationDuration")
        .map(parse_duration)
        .transpose()?;
    let manifest_base = parse_absolute_url(manifest_url)?;
    let mpd_base = apply_base_url(&root, &manifest_base)?;
    let root_segments = segment_list_child(&root, None)?;
    only_children(&root, &["BaseURL", "SegmentList", "Period"])?;
    let periods = root.children_named("Period");
    if periods.len() != 1 {
        return Err(DashError::UnsupportedStructure);
    }

    let period = periods[0];
    check_attributes(period, &["id", "start", "duration"])?;
    ensure_whitespace_text(period)?;
    let period_start = period
        .attr("start")
        .map(parse_duration)
        .transpose()?
        .unwrap_or(Duration::ZERO);
    if !period_start.is_zero() {
        return Err(DashError::UnsupportedStructure);
    }
    let period_duration = period.attr("duration").map(parse_duration).transpose()?;
    let duration = match (root_duration, period_duration) {
        (Some(root), Some(period)) if root != period => return Err(DashError::InvalidDuration),
        (Some(root), _) => root,
        (_, Some(period)) => period,
        (None, None) => return Err(DashError::InvalidDuration),
    };
    if duration.is_zero() {
        return Err(DashError::InvalidDuration);
    }
    let period_base = apply_base_url(period, &mpd_base)?;
    let period_segments = segment_list_child(period, root_segments.as_ref())?;
    only_children(period, &["BaseURL", "SegmentList", "AdaptationSet"])?;

    let mut tracks = Vec::new();
    let mut emitted_segments = 0usize;
    for adaptation in period.children_named("AdaptationSet") {
        check_attributes(
            adaptation,
            &[
                "id",
                "contentType",
                "mimeType",
                "codecs",
                "lang",
                "segmentAlignment",
                "subsegmentAlignment",
                "selectionPriority",
                "maxWidth",
                "maxHeight",
                "maxFrameRate",
                "minBandwidth",
                "maxBandwidth",
            ],
        )?;
        ensure_whitespace_text(adaptation)?;
        only_children(adaptation, &["BaseURL", "SegmentList", "Representation"])?;
        let adaptation_base = apply_base_url(adaptation, &period_base)?;
        let adaptation_segments = segment_list_child(adaptation, period_segments.as_ref())?;
        let adaptation_kind =
            track_kind(adaptation.attr("contentType"), adaptation.attr("mimeType"))?;
        let representations = adaptation.children_named("Representation");
        if representations.is_empty() {
            return Err(DashError::InvalidManifest);
        }

        for representation in representations {
            check_attributes(
                representation,
                &[
                    "id",
                    "bandwidth",
                    "mimeType",
                    "codecs",
                    "width",
                    "height",
                    "frameRate",
                    "audioSamplingRate",
                    "startWithSAP",
                    "scanType",
                    "profiles",
                    "contentType",
                ],
            )?;
            ensure_whitespace_text(representation)?;
            only_children(representation, &["BaseURL", "SegmentList"])?;
            let base = apply_base_url(representation, &adaptation_base)?;
            let list = segment_list_child(representation, adaptation_segments.as_ref())?
                .ok_or(DashError::UnsupportedStructure)?;
            validate_segment_list_coverage(&list, duration)?;
            let mime_type = representation
                .attr("mimeType")
                .or_else(|| adaptation.attr("mimeType"))
                .map(bounded_text)
                .transpose()?;
            let codecs = representation
                .attr("codecs")
                .or_else(|| adaptation.attr("codecs"))
                .map(bounded_text)
                .transpose()?;
            let content_type = representation
                .attr("contentType")
                .or_else(|| adaptation.attr("contentType"));
            let kind = track_kind(content_type, mime_type.as_deref())?
                .ok_or(DashError::UnsupportedStructure)?;
            if adaptation_kind.is_some_and(|parent| parent != kind) {
                return Err(DashError::InvalidManifest);
            }
            let id = representation.attr("id").map(bounded_text).transpose()?;
            let bandwidth = representation
                .attr("bandwidth")
                .map(parse_positive_u64)
                .transpose()?;

            emitted_segments = emitted_segments
                .checked_add(list.segments.len())
                .filter(|count| *count <= MAX_SEGMENTS)
                .ok_or(DashError::TooManySegments)?;
            let initialization_url = resolve_url(&base, &list.initialization)?;
            let segment_urls = list
                .segments
                .iter()
                .map(|reference| resolve_url(&base, reference))
                .collect::<Result<Vec<_>, _>>()?;
            tracks.push(DashTrack {
                kind,
                id,
                mime_type,
                codecs,
                bandwidth,
                initialization_url,
                segment_urls,
            });
        }
    }
    if tracks.is_empty() {
        return Err(DashError::InvalidManifest);
    }
    Ok(DashManifest { duration, tracks })
}

#[derive(Clone)]
struct SegmentList {
    initialization: String,
    segments: Vec<String>,
    duration: Option<u64>,
    timescale: u64,
}

struct XmlNode {
    name: String,
    attributes: Vec<(String, String)>,
    text: String,
    children: Vec<XmlNode>,
}

impl XmlNode {
    fn attr(&self, name: &str) -> Option<&str> {
        self.attributes
            .iter()
            .find(|(key, _)| key == name)
            .map(|(_, value)| value.as_str())
    }

    fn children_named(&self, name: &str) -> Vec<&XmlNode> {
        self.children
            .iter()
            .filter(|child| child.name == name)
            .collect()
    }
}

// quick-xml 0.42 exposes a pull event reader without namespace resolution; prefixed names fail closed.
// API: https://docs.rs/quick-xml/0.42.0/quick_xml/reader/struct.Reader.html
fn parse_xml(xml: &str) -> Result<XmlNode, DashError> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().allow_dangling_amp = false;
    reader.config_mut().allow_unmatched_ends = false;
    reader.config_mut().check_comments = true;
    reader.config_mut().check_end_names = true;
    let mut stack: Vec<XmlNode> = Vec::new();
    let mut root = None;
    let mut elements = 0usize;
    let mut declaration = false;
    let mut prolog_misc = false;

    loop {
        match reader.read_event() {
            Err(_) => return Err(DashError::MalformedXml),
            Ok(Event::Start(element)) => {
                if stack.is_empty() && root.is_some() {
                    return Err(DashError::MalformedXml);
                }
                let node = xml_node(&element, &mut elements, stack.len() + 1)?;
                stack.push(node);
            }
            Ok(Event::Empty(element)) => {
                if stack.is_empty() && root.is_some() {
                    return Err(DashError::MalformedXml);
                }
                let node = xml_node(&element, &mut elements, stack.len() + 1)?;
                append_node(&mut stack, &mut root, node)?;
            }
            Ok(Event::End(element)) => {
                let name = element.name();
                let name = name.as_ref();
                let node = stack.pop().ok_or(DashError::MalformedXml)?;
                if node.name != name {
                    return Err(DashError::MalformedXml);
                }
                append_node(&mut stack, &mut root, node)?;
            }
            Ok(Event::Text(text)) => {
                let text = text.as_ref();
                if let Some(node) = stack.last_mut() {
                    node.text.push_str(text);
                } else if !text.chars().all(is_xml_space) {
                    return Err(DashError::MalformedXml);
                } else if !text.is_empty() {
                    prolog_misc = true;
                }
            }
            Ok(Event::Comment(_)) => {
                if stack.is_empty() && root.is_none() {
                    prolog_misc = true;
                }
            }
            Ok(Event::Decl(decl)) => {
                if declaration || prolog_misc || root.is_some() || !stack.is_empty() {
                    return Err(DashError::MalformedXml);
                }
                if decl
                    .version()
                    .map_err(|_| DashError::MalformedXml)?
                    .as_ref()
                    != "1.0"
                {
                    return Err(DashError::UnsupportedXml);
                }
                if let Some(encoding) = decl.encoding() {
                    let encoding = encoding.map_err(|_| DashError::MalformedXml)?;
                    if !encoding.eq_ignore_ascii_case("utf-8")
                        && !encoding.eq_ignore_ascii_case("utf8")
                    {
                        return Err(DashError::UnsupportedXml);
                    }
                }
                if let Some(standalone) = decl.standalone() {
                    let standalone = standalone.map_err(|_| DashError::MalformedXml)?;
                    if standalone != "yes" && standalone != "no" {
                        return Err(DashError::MalformedXml);
                    }
                }
                declaration = true;
            }
            Ok(Event::DocType(_) | Event::GeneralRef(_) | Event::CData(_) | Event::PI(_)) => {
                return Err(DashError::UnsupportedXml);
            }
            Ok(Event::Eof) => break,
        }
    }
    if !stack.is_empty() {
        return Err(DashError::MalformedXml);
    }
    root.ok_or(DashError::InvalidManifest)
}

fn xml_node(
    element: &BytesStart<'_>,
    elements: &mut usize,
    depth: usize,
) -> Result<XmlNode, DashError> {
    if depth > MAX_XML_DEPTH {
        return Err(DashError::TooDeep);
    }
    *elements += 1;
    if *elements > MAX_XML_ELEMENTS {
        return Err(DashError::TooManyElements);
    }
    let raw_name = element.name();
    let name = raw_name.as_ref();
    if name.is_empty() || name.len() > MAX_NAME_BYTES || name.contains(':') {
        return Err(DashError::UnsupportedXml);
    }

    let mut attributes = Vec::new();
    for result in element.attributes().with_checks(true) {
        let attribute = result.map_err(|_| DashError::MalformedXml)?;
        let key = attribute.key.as_ref();
        let value = attribute.value.as_ref();
        if key.len() > MAX_NAME_BYTES || key.contains(':') || value.len() > MAX_ATTRIBUTE_BYTES {
            return Err(DashError::UnsupportedXml);
        }
        if value.contains('&') {
            return Err(DashError::UnsupportedXml);
        }
        if attributes.iter().any(|(existing, _)| existing == key) {
            return Err(DashError::MalformedXml);
        }
        let value = value.to_owned();
        if key == "xmlns" && value != DASH_NAMESPACE {
            return Err(DashError::UnsupportedXml);
        }
        attributes.push((key.to_owned(), value));
    }
    Ok(XmlNode {
        name: name.to_owned(),
        attributes,
        text: String::new(),
        children: Vec::new(),
    })
}

fn append_node(
    stack: &mut [XmlNode],
    root: &mut Option<XmlNode>,
    node: XmlNode,
) -> Result<(), DashError> {
    if let Some(parent) = stack.last_mut() {
        parent.children.push(node);
    } else if root.replace(node).is_some() {
        return Err(DashError::MalformedXml);
    }
    Ok(())
}

fn check_attributes(node: &XmlNode, allowed: &[&str]) -> Result<(), DashError> {
    for (key, value) in &node.attributes {
        if key == "xmlns" {
            if value != DASH_NAMESPACE {
                return Err(DashError::UnsupportedXml);
            }
        } else if !allowed.contains(&key.as_str()) {
            return Err(DashError::UnsupportedStructure);
        }
    }
    Ok(())
}

fn ensure_whitespace_text(node: &XmlNode) -> Result<(), DashError> {
    if node.text.chars().all(is_xml_space) {
        Ok(())
    } else {
        Err(DashError::UnsupportedStructure)
    }
}

fn only_children(node: &XmlNode, allowed: &[&str]) -> Result<(), DashError> {
    if node
        .children
        .iter()
        .all(|child| allowed.contains(&child.name.as_str()))
    {
        Ok(())
    } else {
        Err(DashError::UnsupportedStructure)
    }
}

fn single_child<'a>(node: &'a XmlNode, name: &str) -> Result<Option<&'a XmlNode>, DashError> {
    let mut found = node.children.iter().filter(|child| child.name == name);
    let first = found.next();
    if found.next().is_some() {
        Err(DashError::UnsupportedStructure)
    } else {
        Ok(first)
    }
}

fn apply_base_url(node: &XmlNode, inherited: &Url) -> Result<Url, DashError> {
    let Some(base_node) = single_child(node, "BaseURL")? else {
        return Ok(inherited.clone());
    };
    check_attributes(base_node, &[])?;
    if !base_node.children.is_empty() {
        return Err(DashError::UnsupportedStructure);
    }
    let reference = base_node.text.trim_matches(is_xml_space);
    join_url(inherited, reference)
}

fn segment_list_child(
    node: &XmlNode,
    inherited: Option<&Arc<SegmentList>>,
) -> Result<Option<Arc<SegmentList>>, DashError> {
    if let Some(list) = single_child(node, "SegmentList")? {
        if inherited.is_some() {
            return Err(DashError::UnsupportedStructure);
        }
        return Ok(Some(Arc::new(parse_segment_list(list)?)));
    }
    Ok(inherited.cloned())
}

fn parse_segment_list(node: &XmlNode) -> Result<SegmentList, DashError> {
    check_attributes(node, &["timescale", "duration"])?;
    ensure_whitespace_text(node)?;
    only_children(node, &["Initialization", "SegmentURL"])?;
    let initializations = node.children_named("Initialization");
    if initializations.len() != 1 {
        return Err(DashError::InvalidManifest);
    }
    let initialization = initializations[0];
    check_attributes(initialization, &["sourceURL"])?;
    ensure_whitespace_text(initialization)?;
    if !initialization.children.is_empty() {
        return Err(DashError::UnsupportedStructure);
    }
    let initialization = required_url_reference(initialization.attr("sourceURL"))?;

    let mut segments = Vec::new();
    for segment in node.children_named("SegmentURL") {
        check_attributes(segment, &["sourceURL"])?;
        ensure_whitespace_text(segment)?;
        if !segment.children.is_empty() {
            return Err(DashError::UnsupportedStructure);
        }
        segments.push(required_url_reference(segment.attr("sourceURL"))?);
        if segments.len() > MAX_SEGMENTS {
            return Err(DashError::TooManySegments);
        }
    }
    if segments.is_empty() {
        return Err(DashError::InvalidManifest);
    }
    if node.children.first().map(|child| child.name.as_str()) != Some("Initialization") {
        return Err(DashError::InvalidManifest);
    }

    let timescale = node
        .attr("timescale")
        .map(parse_positive_u64)
        .transpose()?
        .unwrap_or(1);
    let duration = node.attr("duration").map(parse_positive_u64).transpose()?;
    if let Some(duration) = duration {
        let duration = duration as u128;
        let span = duration
            .checked_mul(segments.len() as u128)
            .ok_or(DashError::DurationExceeded)?;
        if span > (86_400u128 * timescale as u128) {
            return Err(DashError::DurationExceeded);
        }
    } else if segments.len() != 1 {
        // ISO/IEC 23009-1 only defines one segment when neither duration nor
        // SegmentTimeline provides the timing of an explicit SegmentList.
        return Err(DashError::InvalidManifest);
    }
    Ok(SegmentList {
        initialization,
        segments,
        duration,
        timescale,
    })
}

fn validate_segment_list_coverage(
    list: &SegmentList,
    period_duration: Duration,
) -> Result<(), DashError> {
    let Some(segment_duration) = list.duration else {
        return Ok(());
    };
    let segment_span = (segment_duration as u128)
        .checked_mul(NANOS_PER_SECOND)
        .ok_or(DashError::DurationExceeded)?;
    let list_span = segment_span
        .checked_mul(list.segments.len() as u128)
        .ok_or(DashError::DurationExceeded)?;
    let period_span = period_duration
        .as_nanos()
        .checked_mul(list.timescale as u128)
        .ok_or(DashError::DurationExceeded)?;
    if list_span < period_span || list_span - period_span >= segment_span {
        return Err(DashError::InvalidManifest);
    }
    Ok(())
}

fn required_url_reference(value: Option<&str>) -> Result<String, DashError> {
    let value = value.ok_or(DashError::InvalidManifest)?;
    if value.is_empty()
        || value.len() > MAX_URL_BYTES
        || value.chars().any(|character| {
            character.is_control() || character.is_whitespace() || character == '\\'
        })
    {
        return Err(DashError::InvalidUrl);
    }
    Ok(value.to_owned())
}

// url 2.5.8 resolves relative references through `join`; every result is checked before exposure.
// API: https://docs.rs/url/2.5.8/url/struct.Url.html
fn parse_absolute_url(value: &str) -> Result<Url, DashError> {
    if value.len() > MAX_URL_BYTES
        || has_userinfo(value)
        || value.chars().any(|character| {
            character.is_control() || character.is_whitespace() || character == '\\'
        })
    {
        return Err(DashError::InvalidUrl);
    }
    let url = Url::parse(value).map_err(|_| DashError::InvalidUrl)?;
    validate_url(&url)?;
    Ok(url)
}

fn resolve_url(base: &Url, reference: &str) -> Result<String, DashError> {
    let url = join_url(base, reference)?;
    Ok(url.as_str().to_owned())
}

fn join_url(base: &Url, reference: &str) -> Result<Url, DashError> {
    if reference.is_empty()
        || reference.len() > MAX_URL_BYTES
        || has_userinfo(reference)
        || reference.chars().any(|character| {
            character.is_control() || character.is_whitespace() || character == '\\'
        })
    {
        return Err(DashError::InvalidUrl);
    }
    let url = base.join(reference).map_err(|_| DashError::InvalidUrl)?;
    validate_url(&url)?;
    if url.as_str().len() > MAX_URL_BYTES {
        return Err(DashError::InvalidUrl);
    }
    Ok(url)
}

fn has_userinfo(reference: &str) -> bool {
    let authority = reference
        .split_once("://")
        .map(|(_, rest)| rest)
        .or_else(|| reference.strip_prefix("//"));
    authority.is_some_and(|authority| {
        authority
            .split(['/', '?', '#'])
            .next()
            .is_some_and(|authority| authority.contains('@'))
    })
}

fn validate_url(url: &Url) -> Result<(), DashError> {
    let authority = url
        .as_str()
        .split_once("://")
        .map(|(_, rest)| rest.split(['/', '?', '#']).next().unwrap_or(rest));
    if (url.scheme() != "http" && url.scheme() != "https")
        || url.host_str().is_none()
        || authority.is_none_or(|authority| authority.contains('@'))
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(DashError::InvalidUrl);
    }
    Ok(())
}

fn track_kind(
    content_type: Option<&str>,
    mime_type: Option<&str>,
) -> Result<Option<TrackKind>, DashError> {
    let from_content_type = match content_type {
        None => None,
        Some(value) if value.eq_ignore_ascii_case("audio") => Some(TrackKind::Audio),
        Some(value) if value.eq_ignore_ascii_case("video") => Some(TrackKind::Video),
        Some(_) => return Err(DashError::UnsupportedStructure),
    };
    let from_mime = match mime_type {
        Some(value)
            if value
                .get(..6)
                .is_some_and(|prefix| prefix.eq_ignore_ascii_case("audio/")) =>
        {
            Some(TrackKind::Audio)
        }
        Some(value)
            if value
                .get(..6)
                .is_some_and(|prefix| prefix.eq_ignore_ascii_case("video/")) =>
        {
            Some(TrackKind::Video)
        }
        Some(_) | None => None,
    };
    if from_content_type.is_some() && from_mime.is_some() && from_content_type != from_mime {
        return Err(DashError::InvalidManifest);
    }
    Ok(from_content_type.or(from_mime))
}

fn bounded_text(value: &str) -> Result<String, DashError> {
    if value.is_empty() || value.len() > MAX_TRACK_TEXT_BYTES {
        Err(DashError::UnsupportedStructure)
    } else {
        Ok(value.to_owned())
    }
}

fn parse_positive_u64(value: &str) -> Result<u64, DashError> {
    if value.is_empty() || !value.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err(DashError::InvalidManifest);
    }
    value
        .parse::<u64>()
        .ok()
        .filter(|value| *value > 0)
        .ok_or(DashError::InvalidManifest)
}

fn parse_duration(value: &str) -> Result<Duration, DashError> {
    let body = value.strip_prefix('P').ok_or(DashError::InvalidDuration)?;
    let mut parts = body.split('T');
    let date = parts.next().ok_or(DashError::InvalidDuration)?;
    let time = parts.next();
    if parts.next().is_some() {
        return Err(DashError::InvalidDuration);
    }
    let mut nanos = 0u128;
    let mut saw_component = false;

    if !date.is_empty() {
        let (number, rest) = take_digits(date)?;
        if rest != "D" {
            return Err(DashError::InvalidDuration);
        }
        add_duration_component(&mut nanos, number, 86_400)?;
        saw_component = true;
    }
    if let Some(time) = time {
        if time.is_empty() {
            return Err(DashError::InvalidDuration);
        }
        let mut remaining = time;
        let mut last_order = 0u8;
        while !remaining.is_empty() {
            let (number, rest) = take_digits(remaining)?;
            if rest.is_empty() {
                return Err(DashError::InvalidDuration);
            }
            let unit = rest.chars().next().ok_or(DashError::InvalidDuration)?;
            let after_unit = &rest[unit.len_utf8()..];
            let order = match unit {
                'H' => 1,
                'M' => 2,
                'S' => 3,
                _ => return Err(DashError::InvalidDuration),
            };
            if order <= last_order || number.contains('.') && order != 3 {
                return Err(DashError::InvalidDuration);
            }
            match order {
                1 => add_duration_component(&mut nanos, number, 3_600)?,
                2 => add_duration_component(&mut nanos, number, 60)?,
                _ => add_seconds(&mut nanos, number)?,
            }
            saw_component = true;
            last_order = order;
            remaining = after_unit;
        }
    }
    if !saw_component {
        return Err(DashError::InvalidDuration);
    }
    if nanos > MAX_DURATION_NANOS {
        return Err(DashError::DurationExceeded);
    }
    let seconds = (nanos / NANOS_PER_SECOND) as u64;
    let subsec = (nanos % NANOS_PER_SECOND) as u32;
    Ok(Duration::new(seconds, subsec))
}

fn take_digits(value: &str) -> Result<(&str, &str), DashError> {
    let end = value
        .find(|character: char| !character.is_ascii_digit() && character != '.')
        .unwrap_or(value.len());
    let number = &value[..end];
    if number.is_empty()
        || number.starts_with('.')
        || number.ends_with('.')
        || number.matches('.').count() > 1
    {
        return Err(DashError::InvalidDuration);
    }
    Ok((number, &value[end..]))
}

fn add_duration_component(
    total_nanos: &mut u128,
    number: &str,
    seconds_per_unit: u64,
) -> Result<(), DashError> {
    let integer = number
        .parse::<u128>()
        .map_err(|_| DashError::InvalidDuration)?;
    let amount = integer
        .checked_mul(seconds_per_unit as u128)
        .and_then(|seconds| seconds.checked_mul(NANOS_PER_SECOND))
        .ok_or(DashError::DurationExceeded)?;
    *total_nanos = total_nanos
        .checked_add(amount)
        .ok_or(DashError::DurationExceeded)?;
    if *total_nanos > MAX_DURATION_NANOS {
        return Err(DashError::DurationExceeded);
    }
    Ok(())
}

fn add_seconds(total_nanos: &mut u128, number: &str) -> Result<(), DashError> {
    let (integer, fraction) = number.split_once('.').unwrap_or((number, ""));
    let seconds = integer
        .parse::<u128>()
        .map_err(|_| DashError::InvalidDuration)?;
    if fraction.len() > 9 || !fraction.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err(DashError::InvalidDuration);
    }
    let fractional_nanos = if fraction.is_empty() {
        0
    } else {
        let padded = format!("{fraction:0<9}");
        padded
            .parse::<u32>()
            .map_err(|_| DashError::InvalidDuration)?
    };
    let amount = seconds
        .checked_mul(NANOS_PER_SECOND)
        .and_then(|value| value.checked_add(fractional_nanos as u128))
        .ok_or(DashError::DurationExceeded)?;
    *total_nanos = total_nanos
        .checked_add(amount)
        .ok_or(DashError::DurationExceeded)?;
    if *total_nanos > MAX_DURATION_NANOS {
        return Err(DashError::DurationExceeded);
    }
    Ok(())
}

fn is_xml_space(character: char) -> bool {
    matches!(character, ' ' | '\t' | '\r' | '\n')
}

#[cfg(test)]
mod tests {
    use super::*;

    const MPD_HEAD: &str = "<MPD xmlns=\"urn:mpeg:dash:schema:mpd:2011\" type=\"static\" mediaPresentationDuration=\"PT4S\"><Period duration=\"PT4S\">";
    const MPD_TAIL: &str = "</Period></MPD>";

    #[test]
    fn parses_tracks_and_inherited_base_urls_and_segment_lists() {
        let xml = concat!(
            "<MPD xmlns=\"urn:mpeg:dash:schema:mpd:2011\" type=\"static\" mediaPresentationDuration=\"PT4S\">",
            "<BaseURL>https://cdn.example.test/root/</BaseURL><Period duration=\"PT4S\"><BaseURL>period/</BaseURL>",
            "<AdaptationSet contentType=\"video\" mimeType=\"video/mp4\"><BaseURL>video/</BaseURL>",
            "<SegmentList timescale=\"1\" duration=\"2\"><Initialization sourceURL=\"init.mp4\"/>",
            "<SegmentURL sourceURL=\"one.m4s\"/><SegmentURL sourceURL=\"two.m4s\"/></SegmentList>",
            "<Representation id=\"v1\" bandwidth=\"300000\" codecs=\"avc1\"><BaseURL>high/</BaseURL></Representation>",
            "<Representation id=\"v2\" bandwidth=\"100000\"/></AdaptationSet>",
            "<AdaptationSet contentType=\"audio\" mimeType=\"audio/mp4\"><BaseURL>audio/</BaseURL>",
            "<Representation id=\"a1\"><SegmentList><Initialization sourceURL=\"init.m4a\"/>",
            "<SegmentURL sourceURL=\"sound.m4a\"/></SegmentList></Representation></AdaptationSet>",
            "</Period></MPD>"
        );
        let manifest = parse_mpd(
            xml.as_bytes(),
            "https://origin.example.test/media/index.mpd",
        )
        .unwrap();
        assert_eq!(manifest.duration, Duration::from_secs(4));
        assert_eq!(manifest.tracks.len(), 3);
        assert_eq!(manifest.tracks[0].kind, TrackKind::Video);
        assert_eq!(
            manifest.tracks[0].initialization_url(),
            "https://cdn.example.test/root/period/video/high/init.mp4"
        );
        assert_eq!(
            manifest.tracks[0].segment_urls()[1],
            "https://cdn.example.test/root/period/video/high/two.m4s"
        );
        assert_eq!(
            manifest.tracks[1].segment_urls()[0],
            "https://cdn.example.test/root/period/video/one.m4s"
        );
        assert_eq!(manifest.tracks[2].kind, TrackKind::Audio);
        assert_eq!(
            manifest.tracks[2].segment_urls()[0],
            "https://cdn.example.test/root/period/audio/sound.m4a"
        );
    }

    #[test]
    fn selects_mime_types_case_insensitively() {
        let xml = concat!(
            "<MPD xmlns=\"urn:mpeg:dash:schema:mpd:2011\" type=\"static\" mediaPresentationDuration=\"PT4S\">",
            "<Period duration=\"PT4S\"><AdaptationSet><Representation contentType=\"Video\" mimeType=\"Video/mp4\">",
            "<SegmentList duration=\"2\"><Initialization sourceURL=\"init.mp4\"/>",
            "<SegmentURL sourceURL=\"one.m4s\"/><SegmentURL sourceURL=\"two.m4s\"/></SegmentList>",
            "</Representation></AdaptationSet></Period></MPD>"
        );
        let manifest = parse_mpd(xml.as_bytes(), "https://example.test/manifest.mpd").unwrap();
        assert_eq!(manifest.tracks.len(), 1);
        assert_eq!(manifest.tracks[0].kind, TrackKind::Video);
    }

    #[test]
    fn rejects_segment_lists_that_do_not_cover_the_period() {
        let manifest = |period: u8, segment: Option<u8>, count: usize| {
            let duration = segment
                .map(|value| format!(" duration=\"{value}\""))
                .unwrap_or_default();
            let urls = "<SegmentURL sourceURL=\"seg.m4s\"/>".repeat(count);
            format!(
                "<MPD xmlns=\"urn:mpeg:dash:schema:mpd:2011\" type=\"static\" mediaPresentationDuration=\"PT{period}S\"><Period duration=\"PT{period}S\"><AdaptationSet contentType=\"video\"><Representation mimeType=\"video/mp4\"><SegmentList{duration}><Initialization sourceURL=\"init.mp4\"/>{urls}</SegmentList></Representation></AdaptationSet></Period></MPD>"
            )
        };
        let parse = |xml: String| parse_mpd(xml.as_bytes(), "https://example.test/manifest.mpd");

        assert_eq!(
            parse(manifest(4, Some(2), 1)),
            Err(DashError::InvalidManifest)
        );
        assert_eq!(
            parse(manifest(4, Some(2), 3)),
            Err(DashError::InvalidManifest)
        );
        assert_eq!(parse(manifest(4, None, 2)), Err(DashError::InvalidManifest));
        assert_eq!(parse(manifest(5, Some(2), 3)).unwrap().tracks.len(), 1);

        let shadowed_list = concat!(
            "<MPD xmlns=\"urn:mpeg:dash:schema:mpd:2011\" type=\"static\" mediaPresentationDuration=\"PT4S\"><Period duration=\"PT4S\"><AdaptationSet contentType=\"video\">",
            "<SegmentList duration=\"2\"><Initialization sourceURL=\"parent-init.mp4\"/><SegmentURL sourceURL=\"parent.m4s\"/></SegmentList>",
            "<Representation mimeType=\"video/mp4\"><SegmentList duration=\"2\"><Initialization sourceURL=\"child-init.mp4\"/><SegmentURL sourceURL=\"child.m4s\"/></SegmentList></Representation>",
            "</AdaptationSet></Period></MPD>"
        );
        assert_eq!(
            parse_mpd(
                shadowed_list.as_bytes(),
                "https://example.test/manifest.mpd"
            ),
            Err(DashError::UnsupportedStructure)
        );
    }

    #[test]
    fn rejects_templates_protection_ranges_multiple_periods_and_xml_entities() {
        let cases = [
            format!("{MPD_HEAD}<AdaptationSet contentType=\"video\"><Representation mimeType=\"video/mp4\"><SegmentTemplate media=\"$Number$.m4s\"/></Representation></AdaptationSet>{MPD_TAIL}"),
            format!("{MPD_HEAD}<AdaptationSet contentType=\"video\"><ContentProtection schemeIdUri=\"urn:test\"/></AdaptationSet>{MPD_TAIL}"),
            format!("{MPD_HEAD}<AdaptationSet contentType=\"video\"><Representation mimeType=\"video/mp4\"><SegmentList><Initialization sourceURL=\"init\" range=\"0-10\"/><SegmentURL sourceURL=\"seg\"/></SegmentList></Representation></AdaptationSet>{MPD_TAIL}"),
            "<!DOCTYPE MPD [<!ENTITY seg \"segment.m4s\">]><MPD type=\"static\" mediaPresentationDuration=\"PT1S\"><Period duration=\"PT1S\"/></MPD>".to_owned(),
            "<MPD type=\"static\" mediaPresentationDuration=\"PT1S\"><Period duration=\"PT1S\"><BaseURL>&amp;</BaseURL></Period></MPD>".to_owned(),
            format!("{MPD_HEAD}<AdaptationSet contentType=\"video\"><Representation mimeType=\"video/mp4\"><SegmentList><Initialization sourceURL=\"init\"/><SegmentURL sourceURL=\"seg\" mediaRange=\"0-10\"/></SegmentList></Representation></AdaptationSet><Period duration=\"PT4S\"/></MPD>"),
            format!("{MPD_HEAD}<AdaptationSet contentType=\"video\"><Representation mimeType=\"video/mp4\"><SegmentBase indexRange=\"0-10\"/></Representation></AdaptationSet>{MPD_TAIL}"),
            format!("{MPD_HEAD}<AdaptationSet contentType=\"video\"><Representation mimeType=\"video/mp4\"><SegmentList><Initialization sourceURL=\"init\"/><SegmentTimeline><S d=\"2\"/></SegmentTimeline></SegmentList></Representation></AdaptationSet>{MPD_TAIL}"),
            format!("{MPD_HEAD}<AdaptationSet contentType=\"video\"><Representation mimeType=\"video/mp4\"><BaseURL xlink:href=\"segment.m4s\"/></Representation></AdaptationSet>{MPD_TAIL}"),
        ];
        for xml in cases {
            assert!(parse_mpd(xml.as_bytes(), "https://example.test/manifest.mpd").is_err());
        }
    }

    #[test]
    fn rejects_unsafe_urls_and_never_prints_urls_in_debug_or_errors() {
        for reference in [
            "https://user:secret@example.test/seg.m4s",
            "https://@example.test/seg.m4s",
            "https://example.test/seg.m4s?token=secret",
            "https://example.test/seg.m4s#fragment",
            "javascript:alert(1)",
        ] {
            let xml = format!(
                "{MPD_HEAD}<AdaptationSet contentType=\"video\"><Representation mimeType=\"video/mp4\"><SegmentList><Initialization sourceURL=\"init\"/><SegmentURL sourceURL=\"{reference}\"/></SegmentList></Representation></AdaptationSet>{MPD_TAIL}"
            );
            assert_eq!(
                parse_mpd(xml.as_bytes(), "https://example.test/manifest.mpd"),
                Err(DashError::InvalidUrl)
            );
        }

        let invalid = parse_mpd(
            concat!(
                "<MPD xmlns=\"urn:mpeg:dash:schema:mpd:2011\" type=\"static\" mediaPresentationDuration=\"PT1S\"><Period duration=\"PT1S\">",
                "<AdaptationSet contentType=\"video\"><Representation mimeType=\"video/mp4\"><SegmentList><Initialization sourceURL=\"init\"/><SegmentURL sourceURL=\"seg\"/>",
                "</SegmentList></Representation></AdaptationSet></Period></MPD>"
            )
            .as_bytes(),
            "https://user:secret@example.test/manifest?token=secret",
        )
        .unwrap_err();
        let printed_error = format!("{invalid:?} {invalid}");
        assert!(!printed_error.contains("secret"));

        let xml = concat!(
            "<MPD xmlns=\"urn:mpeg:dash:schema:mpd:2011\" type=\"static\" mediaPresentationDuration=\"PT1S\"><Period duration=\"PT1S\">",
            "<AdaptationSet contentType=\"video\"><Representation mimeType=\"video/mp4\"><SegmentList>",
            "<Initialization sourceURL=\"private-name/init.mp4\"/><SegmentURL sourceURL=\"private-name/segment.m4s\"/>",
            "</SegmentList></Representation></AdaptationSet></Period></MPD>"
        );
        let manifest = parse_mpd(xml.as_bytes(), "https://example.test/manifest.mpd").unwrap();
        assert!(!format!("{manifest:?}").contains("private-name"));
    }

    #[test]
    fn enforces_input_depth_segment_and_duration_limits() {
        assert_eq!(
            parse_mpd(&vec![b' '; MAX_XML_BYTES + 1], "https://example.test/a.mpd"),
            Err(DashError::InputTooLarge)
        );

        let mut deep = String::from("<MPD>");
        for _ in 0..MAX_XML_DEPTH {
            deep.push_str("<x>");
        }
        for _ in 0..MAX_XML_DEPTH {
            deep.push_str("</x>");
        }
        deep.push_str("</MPD>");
        assert_eq!(
            parse_mpd(deep.as_bytes(), "https://example.test/a.mpd"),
            Err(DashError::TooDeep)
        );

        let mut many = String::from(
            "<MPD xmlns=\"urn:mpeg:dash:schema:mpd:2011\" type=\"static\" mediaPresentationDuration=\"PT1S\"><Period duration=\"PT1S\"><AdaptationSet contentType=\"video\"><Representation mimeType=\"video/mp4\"><SegmentList><Initialization sourceURL=\"init\"/>",
        );
        for _ in 0..=MAX_SEGMENTS {
            many.push_str("<SegmentURL sourceURL=\"s\"/>");
        }
        many.push_str("</SegmentList></Representation></AdaptationSet></Period></MPD>");
        assert_eq!(
            parse_mpd(many.as_bytes(), "https://example.test/a.mpd"),
            Err(DashError::TooManySegments)
        );

        let too_long = "<MPD xmlns=\"urn:mpeg:dash:schema:mpd:2011\" type=\"static\" mediaPresentationDuration=\"P1DT1S\"><Period duration=\"P1DT1S\"/></MPD>";
        assert_eq!(
            parse_mpd(too_long.as_bytes(), "https://example.test/a.mpd"),
            Err(DashError::DurationExceeded)
        );
        assert_eq!(
            parse_duration("PT24H").unwrap(),
            Duration::from_secs(86_400)
        );
        assert_eq!(parse_duration("PT1"), Err(DashError::InvalidDuration));
        assert_eq!(parse_duration("PT1é"), Err(DashError::InvalidDuration));
        let malformed_duration = "<MPD xmlns=\"urn:mpeg:dash:schema:mpd:2011\" type=\"static\" mediaPresentationDuration=\"PT1é\"><Period duration=\"PT1é\"/></MPD>";
        assert_eq!(
            parse_mpd(malformed_duration.as_bytes(), "https://example.test/a.mpd"),
            Err(DashError::InvalidDuration)
        );
        assert_eq!(
            parse_mpd(
                "<MPD xmlns=\"urn:mpeg:dash:schema:mpd:2011\" type=\"dynamic\" mediaPresentationDuration=\"PT1S\"><Period duration=\"PT1S\"/></MPD>".as_bytes(),
                "https://example.test/a.mpd"
            ),
            Err(DashError::UnsupportedStructure)
        );
    }
}
