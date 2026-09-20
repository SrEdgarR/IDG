use super::*;
impl Downloads {
    pub(super) fn delete_file(&self, request: &Request) -> Result<Payload, DownloadError> {
        let Command::Library {
            operation:
                LibraryCommand::DeleteFile {
                    job_id,
                    path,
                    sha256,
                },
        } = &request.command
        else {
            return Err(DownloadError::InvalidInput);
        };
        let job = {
            let mut inner = self.inner.lock().map_err(|_| DownloadError::Storage)?;
            if inner.stopping {
                return Err(DownloadError::Busy);
            }
            if let Some(reply) = inner.store.receipt(request)? {
                return Ok(reply);
            }
            if inner.file_operations.contains(job_id) {
                return Err(DownloadError::Busy);
            }
            let job = inner
                .jobs
                .get(job_id)
                .ok_or(DownloadError::NotFound)?
                .clone();
            if inner.active.contains_key(job_id)
                || job.state != TransferState::Completed
                || &job.final_path != path
                || job.calculated_sha256.as_ref() != Some(sha256)
            {
                return Err(DownloadError::Conflict);
            }
            let unknown = Payload::BulkResults { items: vec![BulkItem {
                id: job.id.clone(), outcome: "unconfirmed".into(),
                message: "Eliminación sin confirmación; consulta el archivo. No se repetirá automáticamente.".into(),
            }] };
            let mut state = inner.organization.clone();
            if inner.power_countdown.is_some() {
                state.power_remaining = None;
                state.power_message =
                    "Acción cancelada: hay una operación de archivo pendiente.".into();
            }
            inner
                .store
                .save_organization(&state, &[], None, Some((request, &unknown)))?;
            inner.organization = state;
            inner.power_countdown = None;
            inner.file_operations.insert(job_id.clone());
            job
        };
        // Hashing may take time: never hold the runtime mutex while accessing the file.
        let result = idg_platform_windows::files::delete_verified(
            std::path::Path::new(path),
            job.durable,
            sha256,
        );
        let item = match result {
            Ok(()) => BulkItem { id: job.id, outcome: "accepted".into(), message: "Archivo eliminado del disco. El historial se conserva. No hay deshacer del archivo.".into() },
            Err(e) => BulkItem { id: job.id, outcome: "failed".into(), message: e.message().into() },
        };
        let reply = Payload::BulkResults { items: vec![item] };
        let mut inner = self.inner.lock().map_err(|_| DownloadError::Storage)?;
        inner.file_operations.remove(job_id);
        inner.store.update_receipt(request, &reply)?;
        Ok(reply)
    }
    pub(super) fn bulk(
        &self,
        request: &Request,
        ids: &[String],
        operation: &BulkAction,
    ) -> Result<Payload, DownloadError> {
        if ids.is_empty()
            || ids.len() > 1000
            || ids.iter().any(|s| s.is_empty() || s.len() > 64)
            || ids.iter().collect::<std::collections::BTreeSet<_>>().len() != ids.len()
        {
            return Err(DownloadError::InvalidInput);
        }
        let mut items=ids.iter().map(|id|BulkItem{id:id.clone(),outcome:"unconfirmed".into(),message:"Sin confirmación. No se repetirá automáticamente; consulta el estado del trabajo.".into()}).collect::<Vec<_>>();
        {
            let mut inner = self.inner.lock().map_err(|_| DownloadError::Storage)?;
            if inner.stopping {
                return Err(DownloadError::Busy);
            }
            if let Some(receipt) = inner.store.receipt(request)? {
                return Ok(receipt);
            }
            // Claim the complete intent before effects. A crash never replays a resume/GET.
            let state = inner.organization.clone();
            inner.store.save_organization(
                &state,
                &[],
                None,
                Some((
                    request,
                    &Payload::BulkResults {
                        items: items.clone(),
                    },
                )),
            )?;
        }
        for (index, id) in ids.iter().enumerate() {
            let command = match operation {
                BulkAction::Pause => Command::PauseDownload { job_id: id.clone() },
                BulkAction::Resume => Command::ResumeDownload { job_id: id.clone() },
                BulkAction::Cancel => Command::CancelDownload { job_id: id.clone() },
                BulkAction::MoveQueue { queue_id } => Command::Organization {
                    operation: OrganizationCommand::MoveJobs {
                        ids: vec![id.clone()],
                        queue_id: queue_id.clone(),
                    },
                },
                action => Command::Organization {
                    operation: OrganizationCommand::EditJob {
                        job_id: id.clone(),
                        hidden: match action {
                            BulkAction::Hide => Some(true),
                            BulkAction::Restore => Some(false),
                            _ => None,
                        },
                        category: if let BulkAction::SetCategory { category } = action {
                            Some(category.clone())
                        } else {
                            None
                        },
                        priority: if let BulkAction::SetPriority { priority } = action {
                            Some(priority.clone())
                        } else {
                            None
                        },
                    },
                },
            };
            let compatible = {
                let inner = self.inner.lock().map_err(|_| DownloadError::Storage)?;
                inner.jobs.get(id).map(|j| match operation {
                    BulkAction::Pause => matches!(
                        j.state,
                        TransferState::Downloading | TransferState::Probing | TransferState::Queued
                    ),
                    BulkAction::Resume => matches!(
                        j.state,
                        TransferState::Paused
                            | TransferState::Deferred
                            | TransferState::Failed
                            | TransferState::PublishPending
                    ),
                    BulkAction::Cancel => !matches!(
                        j.state,
                        TransferState::Completed
                            | TransferState::Cancelled
                            | TransferState::Verifying
                            | TransferState::PublishPending
                    ),
                    _ => true,
                })
            };
            let result = match compatible {
                Some(false) => Err(DownloadError::InvalidState),
                None => Err(DownloadError::NotFound),
                Some(true) => self.handle(Request {
                    version: request.version,
                    id: idg_core::library::child_operation_id(&request.id, index),
                    command,
                }),
            };
            let (outcome, message) = match result {
                Ok(_) => ("accepted", "Solicitud aceptada por el motor.".into()),
                Err(DownloadError::InvalidState | DownloadError::Busy) => (
                    "skipped",
                    "Omitido: estado incompatible o capacidad ocupada.".into(),
                ),
                Err(error) => ("failed", error.message().into()),
            };
            items[index].outcome = outcome.into();
            items[index].message = message;
            let mut inner = self.inner.lock().map_err(|_| DownloadError::Storage)?;
            inner.store.update_receipt(
                request,
                &Payload::BulkResults {
                    items: items.clone(),
                },
            )?;
        }
        Ok(Payload::BulkResults { items })
    }
    pub(super) fn tick_library(&self, inner: &mut Inner, now: u64) {
        let mut state = inner.organization.clone();
        let mut changed = Vec::new();
        for job in inner
            .jobs
            .values()
            .filter(|j| !inner.active.contains_key(&j.id))
        {
            let mut j = job.clone();
            if matches!(j.state, TransferState::Completed | TransferState::Cancelled)
                && j.organization.finished_at.is_none()
            {
                j.organization.finished_at = Some(now.min(u32::MAX as u64) as u32);
            }
            if j.state == TransferState::Completed && !j.organization.stats_recorded {
                j.organization.stats_recorded = true;
                if state.library.statistics && !j.organization.private {
                    idg_core::library::record_statistics(&mut state.statistics, &j, now);
                }
            }
            if idg_core::library::retention_due(&j, state.library.retention_days, now) {
                j.organization.hidden = true;
            }
            if j.organization != job.organization {
                changed.push(j);
            }
        }
        if !changed.is_empty()
            && inner
                .store
                .save_organization(&state, &changed, None, None)
                .is_ok()
        {
            inner.organization = state;
            for job in changed {
                self.emit(&job);
                inner.jobs.insert(job.id.clone(), job);
            }
        }
    }
}
