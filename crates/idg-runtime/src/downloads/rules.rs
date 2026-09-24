use super::*;
pub(super) fn preview(
    state: &OrganizationState,
    input: &NewDownload,
    size: Option<u64>,
    media_type: Option<&str>,
    overrides: &[String],
) -> Result<RulePreview, DownloadError> {
    download::validate_input(input)?;
    let minute = (std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
        / 60
        % 1440) as u32;
    Ok(idg_core::rules::evaluate(
        &state.rules,
        &idg_core::rules::Facts {
            url: &input.url,
            name: &input.name,
            size,
            media_type,
            utc_minute: minute,
        },
        overrides,
    ))
}
pub(super) fn effect_valid(
    state: &OrganizationState,
    effect: &RuleEffect,
) -> Result<(), DownloadError> {
    if effect
        .category
        .as_ref()
        .is_some_and(|s| !state.categories.contains(s))
        || effect
            .queue_id
            .as_ref()
            .is_some_and(|s| !state.queues.iter().any(|q| &q.id == s))
    {
        return Err(DownloadError::InvalidInput);
    }
    if let Some(directory) = &effect.directory {
        download::validate_input(&NewDownload {
            url: "https://example.org/validation".into(),
            name: "validation.bin".into(),
            directory: directory.clone(),
            expected_sha256: None,
            conflict: ConflictPolicy::Reject,
        })?;
        if !std::path::Path::new(directory).is_dir() {
            return Err(DownloadError::InvalidInput);
        }
    }
    Ok(())
}
pub(super) fn apply(draft: &mut CreateDownload, effect: &RuleEffect) {
    if let Some(v) = &effect.directory {
        draft.input.directory = v.clone();
    }
    if let Some(v) = &effect.category {
        draft.category = v.clone();
    }
    if let Some(v) = &effect.queue_id {
        draft.queue_id = v.clone();
    }
    if let Some(v) = effect.bytes_per_second {
        draft.options.bytes_per_second = Some(v);
    }
    if let Some(v) = &effect.priority {
        draft.options.priority = v.clone();
    }
}
pub(super) fn job_preview(
    state: &OrganizationState,
    job: &Job,
) -> Result<RulePreview, DownloadError> {
    let mut result = preview(
        state,
        &job.input,
        job.total,
        job.organization.media_type.as_deref(),
        &[],
    )?;
    if result
        .effect
        .directory
        .as_ref()
        .is_some_and(|d| d != &job.input.directory)
    {
        result.explanations.push("Carpeta omitida: el trabajo ya tiene un archivo/parcial. No se mueve; crea un trabajo nuevo para otro destino.".into());
        result.effect.directory = None;
    }
    Ok(result)
}
