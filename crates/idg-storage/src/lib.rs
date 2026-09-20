//! Only the runtime owns this store. Entire job payloads are DPAPI-protected.
use idg_core::download::{Checkpoint, Job};
use idg_protocol::DownloadError;
use rusqlite::{Connection, params};
use std::path::Path;
mod protection;

pub struct Store {
    connection: Connection,
}
pub struct LoadedJobs {
    pub jobs: Vec<Job>,
    pub unavailable: Vec<(String, DownloadError)>,
}
impl Store {
    pub fn open(path: &Path) -> Result<Self, DownloadError> {
        let mut connection = Connection::open(path).map_err(|_| DownloadError::Storage)?;
        connection
            .busy_timeout(std::time::Duration::from_secs(2))
            .map_err(|_| DownloadError::Storage)?;
        connection
            .pragma_update(None, "journal_mode", "WAL")
            .map_err(|_| DownloadError::Storage)?;
        connection
            .pragma_update(None, "synchronous", "FULL")
            .map_err(|_| DownloadError::Storage)?;
        let tx = connection
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
            .map_err(|_| DownloadError::Storage)?;
        tx.execute_batch(
            "CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY)",
        )
        .map_err(|_| DownloadError::Storage)?;
        let version: u32 = tx
            .query_row(
                "SELECT COALESCE(MAX(version),0) FROM schema_migrations",
                [],
                |r| r.get(0),
            )
            .map_err(|_| DownloadError::Storage)?;
        match version {
            0 => tx
                .execute_batch(include_str!("../migrations/001.sql"))
                .map_err(|_| DownloadError::Storage)?,
            1..=4 => {}
            _ => return Err(DownloadError::Storage),
        }
        if version < 2 {
            tx.execute_batch(include_str!("../migrations/002.sql"))
                .map_err(|_| DownloadError::Storage)?;
        }
        if version < 3 {
            tx.execute_batch(include_str!("../migrations/003.sql"))
                .map_err(|_| DownloadError::Storage)?;
        }
        if version < 4 {
            tx.execute_batch(include_str!("../migrations/004.sql"))
                .map_err(|_| DownloadError::Storage)?;
        }
        tx.commit().map_err(|_| DownloadError::Storage)?;
        Ok(Self { connection })
    }
    pub fn organization(&self) -> Result<Option<idg_protocol::OrganizationState>, DownloadError> {
        use rusqlite::OptionalExtension;
        let bytes: Option<Vec<u8>> = self
            .connection
            .query_row(
                "SELECT protected_value FROM organization WHERE id=1",
                [],
                |r| r.get(0),
            )
            .optional()
            .map_err(|_| DownloadError::Storage)?;
        bytes
            .map(|bytes| {
                let mut clear = protection::decrypt(&bytes)?;
                let result = serde_json::from_slice(&clear).map_err(|_| DownloadError::Storage);
                clear.fill(0);
                result
            })
            .transpose()
    }
    /// Organization and affected job records commit together; failure leaves both unchanged.
    pub fn save_organization(
        &mut self,
        state: &idg_protocol::OrganizationState,
        jobs: &[Job],
        preferences: Option<&idg_protocol::AppPreferences>,
        receipt: Option<(&idg_protocol::Request, &idg_protocol::Payload)>,
    ) -> Result<(), DownloadError> {
        fn seal<T: serde::Serialize>(value: &T) -> Result<Vec<u8>, DownloadError> {
            let mut clear = serde_json::to_vec(value).map_err(|_| DownloadError::Storage)?;
            let sealed = protection::encrypt(&clear);
            clear.fill(0);
            sealed
        }
        let value = seal(state)?;
        let records = jobs
            .iter()
            .map(|j| Ok((j.id.clone(), seal(j)?)))
            .collect::<Result<Vec<_>, DownloadError>>()?;
        let prefs = preferences.map(seal).transpose()?;
        let receipt = receipt
            .map(|(r, p)| Ok((r.id.clone(), seal(&(r.command.clone(), p))?)))
            .transpose()?;
        let tx = self
            .connection
            .transaction()
            .map_err(|_| DownloadError::Storage)?;
        tx.execute("INSERT INTO organization VALUES(1,?1) ON CONFLICT(id) DO UPDATE SET protected_value=excluded.protected_value",params![value]).map_err(|_|DownloadError::Storage)?;
        for (id, blob) in records {
            tx.execute("INSERT INTO downloads(id,protected_job) VALUES(?1,?2) ON CONFLICT(id) DO UPDATE SET protected_job=excluded.protected_job",params![id,blob]).map_err(|_|DownloadError::Storage)?;
        }
        if let Some(prefs) = prefs {
            tx.execute("INSERT INTO app_preferences VALUES(1,?1) ON CONFLICT(id) DO UPDATE SET protected_value=excluded.protected_value",params![prefs]).map_err(|_|DownloadError::Storage)?;
        }
        if let Some((id, value)) = receipt {
            tx.execute(
                "INSERT INTO operation_receipts VALUES(?1,?2)",
                params![id, value],
            )
            .map_err(|_| DownloadError::Storage)?;
        }
        tx.commit().map_err(|_| DownloadError::Storage)
    }
    pub fn receipt(
        &self,
        request: &idg_protocol::Request,
    ) -> Result<Option<idg_protocol::Payload>, DownloadError> {
        use rusqlite::OptionalExtension;
        let bytes: Option<Vec<u8>> = self
            .connection
            .query_row(
                "SELECT protected_value FROM operation_receipts WHERE id=?1",
                params![request.id],
                |r| r.get(0),
            )
            .optional()
            .map_err(|_| DownloadError::Storage)?;
        let Some(bytes) = bytes else {
            return Ok(None);
        };
        let mut clear = protection::decrypt(&bytes)?;
        let decoded =
            serde_json::from_slice::<(idg_protocol::Command, idg_protocol::Payload)>(&clear)
                .map_err(|_| DownloadError::Storage);
        clear.fill(0);
        let (command, payload) = decoded?;
        if command != request.command {
            return Err(DownloadError::Conflict);
        }
        Ok(Some(payload))
    }
    pub fn limits(&self) -> Result<idg_protocol::ResourceLimits, DownloadError> {
        use rusqlite::OptionalExtension;
        let bytes: Option<Vec<u8>> = self
            .connection
            .query_row(
                "SELECT protected_limits FROM settings WHERE id=1",
                [],
                |r| r.get(0),
            )
            .optional()
            .map_err(|_| DownloadError::Storage)?;
        match bytes {
            None => Ok(Default::default()),
            Some(bytes) => {
                let mut clear = protection::decrypt(&bytes)?;
                let result = serde_json::from_slice::<idg_protocol::ResourceLimits>(&clear)
                    .map_err(|_| DownloadError::Storage);
                clear.fill(0);
                let limits = result?;
                limits.validate()?;
                Ok(limits)
            }
        }
    }
    pub fn preferences(&self) -> Result<idg_protocol::AppPreferences, DownloadError> {
        use rusqlite::OptionalExtension;
        let bytes: Option<Vec<u8>> = self
            .connection
            .query_row(
                "SELECT protected_value FROM app_preferences WHERE id=1",
                [],
                |r| r.get(0),
            )
            .optional()
            .map_err(|_| DownloadError::Storage)?;
        let Some(bytes) = bytes else {
            return Ok(Default::default());
        };
        let mut clear = protection::decrypt(&bytes)?;
        let result = serde_json::from_slice::<idg_protocol::AppPreferences>(&clear)
            .map_err(|_| DownloadError::Storage);
        clear.fill(0);
        let preferences = result?;
        preferences.validate()?;
        Ok(preferences)
    }
    pub fn save_preferences(
        &mut self,
        preferences: &idg_protocol::AppPreferences,
    ) -> Result<(), DownloadError> {
        preferences.validate()?;
        let mut clear = serde_json::to_vec(preferences).map_err(|_| DownloadError::Storage)?;
        let sealed = protection::encrypt(&clear);
        clear.fill(0);
        self.connection.execute("INSERT INTO app_preferences VALUES(1,?1) ON CONFLICT(id) DO UPDATE SET protected_value=excluded.protected_value",params![sealed?]).map_err(|_|DownloadError::Storage)?;
        Ok(())
    }
    pub fn save_limits(
        &mut self,
        limits: &idg_protocol::ResourceLimits,
    ) -> Result<(), DownloadError> {
        limits.validate()?;
        let mut clear = serde_json::to_vec(limits).map_err(|_| DownloadError::Storage)?;
        let sealed = protection::encrypt(&clear);
        clear.fill(0);
        self.connection.execute("INSERT INTO settings VALUES(1,?1) ON CONFLICT(id) DO UPDATE SET protected_limits=excluded.protected_limits",params![sealed?]).map_err(|_|DownloadError::Storage)?;
        Ok(())
    }
    pub fn load(&self) -> Result<LoadedJobs, DownloadError> {
        let mut statement = self
            .connection
            .prepare("SELECT id, protected_job FROM downloads ORDER BY rowid")
            .map_err(|_| DownloadError::Storage)?;
        let blobs = statement
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, Vec<u8>>(1)?))
            })
            .map_err(|_| DownloadError::Storage)?;
        let mut jobs = Vec::new();
        let mut unavailable = Vec::new();
        for blob in blobs {
            let (id, blob) = blob.map_err(|_| DownloadError::Storage)?;
            let result = protection::decrypt(&blob).and_then(|mut clear| {
                let result =
                    serde_json::from_slice::<Job>(&clear).map_err(|_| DownloadError::Storage);
                clear.fill(0);
                result.and_then(|job| {
                    if job.id == id {
                        Ok(job)
                    } else {
                        Err(DownloadError::Storage)
                    }
                })
            });
            match result {
                Ok(job) => jobs.push(job),
                Err(error) => unavailable.push((id, error)),
            }
        }
        Ok(LoadedJobs { jobs, unavailable })
    }
}
impl Checkpoint for Store {
    fn save(&mut self, job: &Job) -> Result<(), DownloadError> {
        let mut bytes = serde_json::to_vec(job).map_err(|_| DownloadError::Storage)?;
        let encrypted = protection::encrypt(&bytes);
        bytes.fill(0);
        let encrypted = encrypted?;
        self.connection.execute("INSERT INTO downloads(id,protected_job) VALUES(?1,?2) ON CONFLICT(id) DO UPDATE SET protected_job=excluded.protected_job",params![job.id,encrypted]).map_err(|_|DownloadError::Storage)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(windows)]
    #[test]
    fn phase05_migration_and_receipt_are_atomic_and_preserve_records() {
        use idg_protocol::*;
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("phase05.sqlite3");
        let connection = Connection::open(&path).unwrap();
        connection
            .execute_batch("CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY)")
            .unwrap();
        for sql in [
            include_str!("../migrations/001.sql"),
            include_str!("../migrations/002.sql"),
            include_str!("../migrations/003.sql"),
        ] {
            connection.execute_batch(sql).unwrap();
        }
        let job = idg_core::download::create_job(
            "old",
            NewDownload {
                url: "https://example.org/file".into(),
                directory: dir.path().to_string_lossy().into(),
                name: "file.bin".into(),
                expected_sha256: None,
                conflict: ConflictPolicy::Reject,
            },
        )
        .unwrap();
        let mut legacy = serde_json::to_value(&job).unwrap();
        legacy.as_object_mut().unwrap().remove("organization");
        let blob = protection::encrypt(&serde_json::to_vec(&legacy).unwrap()).unwrap();
        connection
            .execute("INSERT INTO downloads VALUES('old',?1)", params![&blob])
            .unwrap();
        drop(connection);
        let mut store = Store::open(&path).unwrap();
        let loaded = store.load().unwrap();
        assert_eq!(loaded.jobs[0].organization.queue_id, "main");
        let unchanged: Vec<u8> = store
            .connection
            .query_row("SELECT protected_job FROM downloads", [], |r| r.get(0))
            .unwrap();
        assert_eq!(blob, unchanged);
        let state = OrganizationState::default();
        let request = Request {
            version: 1,
            id: "receipt-test".into(),
            command: Command::Organization {
                operation: OrganizationCommand::RunQueue {
                    id: "main".into(),
                    running: true,
                },
            },
        };
        let reply = Payload::Organization {
            state: state.clone(),
        };
        store
            .save_organization(&state, &[], None, Some((&request, &reply)))
            .unwrap();
        let mut changed = loaded.jobs[0].clone();
        changed.organization.order = 99;
        let mut other = state.clone();
        other.queues[0].name = "Must roll back".into();
        // Duplicate receipt causes the whole transaction to roll back, including jobs/config.
        assert!(
            store
                .save_organization(&other, &[changed], None, Some((&request, &reply)))
                .is_err()
        );
        drop(store);
        let store = Store::open(&path).unwrap();
        assert_eq!(store.organization().unwrap(), Some(state));
        assert_eq!(store.load().unwrap().jobs[0].organization.order, 0);
        assert!(matches!(
            store.receipt(&request).unwrap(),
            Some(Payload::Organization { .. })
        ));
        let collision = Request {
            command: Command::Organization {
                operation: OrganizationCommand::CancelPower,
            },
            ..request
        };
        assert!(matches!(
            store.receipt(&collision),
            Err(DownloadError::Conflict)
        ));
    }
    #[test]
    fn migration_is_idempotent() {
        let store = Store::open(Path::new(":memory:")).unwrap();
        let n: u32 = store
            .connection
            .query_row("SELECT COUNT(*) FROM schema_migrations", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 4);
    }
    #[cfg(windows)]
    #[test]
    fn preferences_survive_reopen_without_plaintext() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("prefs.sqlite3");
        let mut store = Store::open(&file).unwrap();
        let prefs = idg_protocol::AppPreferences {
            welcome_done: true,
            directory: dir.path().to_string_lossy().into_owned(),
            theme: "dark".into(),
            queue_running: true,
            ..Default::default()
        };
        store.save_preferences(&prefs).unwrap();
        let bytes: Vec<u8> = store
            .connection
            .query_row("SELECT protected_value FROM app_preferences", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert!(
            !bytes
                .windows(prefs.directory.len())
                .any(|w| w == prefs.directory.as_bytes())
        );
        drop(store);
        assert_eq!(Store::open(&file).unwrap().preferences().unwrap(), prefs);
    }
    #[test]
    fn interrupted_migration_rolls_back_and_reopens() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("migration.sqlite3");
        {
            let mut c = Connection::open(&path).unwrap();
            let tx = c.transaction().unwrap();
            tx.execute_batch("CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY); CREATE TABLE downloads(id TEXT PRIMARY KEY, protected_job BLOB NOT NULL); INSERT INTO schema_migrations VALUES(1)").unwrap();
        }
        drop(Store::open(&path).unwrap());
        drop(Store::open(&path).unwrap());
    }
    #[test]
    fn future_schema_and_locked_db_are_not_overwritten() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("locked.sqlite3");
        drop(Store::open(&path).unwrap());
        let other = Connection::open(&path).unwrap();
        other
            .execute_batch("BEGIN IMMEDIATE; INSERT INTO schema_migrations VALUES(5);")
            .unwrap();
        assert!(matches!(Store::open(&path), Err(DownloadError::Storage)));
        other.execute_batch("COMMIT").unwrap();
        assert!(matches!(Store::open(&path), Err(DownloadError::Storage)));
        let version: u32 = other
            .query_row("SELECT MAX(version) FROM schema_migrations", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(version, 5);
    }
    #[cfg(windows)]
    #[test]
    fn dpapi_roundtrip_is_not_plaintext() {
        let secret = b"https://example.org/private?token=fixture";
        let sealed = protection::encrypt(secret).unwrap();
        assert!(!sealed.windows(secret.len()).any(|w| w == secret));
        assert_eq!(protection::decrypt(&sealed).unwrap(), secret);
    }
    #[cfg(windows)]
    #[test]
    fn corrupt_job_is_isolated_without_overwriting_its_blob() {
        let dir = tempfile::tempdir().unwrap();
        let mut store = Store::open(Path::new(":memory:")).unwrap();
        let input = idg_protocol::NewDownload {
            url: "https://example.org/file".into(),
            directory: dir.path().to_string_lossy().into(),
            name: "safe.bin".into(),
            expected_sha256: None,
            conflict: idg_protocol::ConflictPolicy::Reject,
        };
        let job = idg_core::download::create_job("safe", input).unwrap();
        store.save(&job).unwrap();
        store
            .connection
            .execute(
                "INSERT INTO downloads VALUES('corrupt', ?1)",
                params![b"broken".as_slice()],
            )
            .unwrap();
        let loaded = store.load().unwrap();
        assert_eq!(loaded.jobs.len(), 1);
        assert_eq!(loaded.jobs[0].id, "safe");
        assert_eq!(
            loaded.unavailable,
            vec![("corrupt".into(), DownloadError::SecretUnavailable)]
        );
        let blob: Vec<u8> = store
            .connection
            .query_row(
                "SELECT protected_job FROM downloads WHERE id='corrupt'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(blob, b"broken");
    }
    #[cfg(windows)]
    #[test]
    fn migration_preserves_phase03_protected_job_and_defaults_new_fields() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("legacy.sqlite3");
        let input = idg_protocol::NewDownload {
            url: "https://example.org/old".into(),
            directory: dir.path().to_string_lossy().into(),
            name: "old.bin".into(),
            expected_sha256: None,
            conflict: idg_protocol::ConflictPolicy::Reject,
        };
        let job = idg_core::download::create_job("old", input).unwrap();
        let mut old = serde_json::to_value(job).unwrap();
        for key in ["options", "ranges", "transferred", "retries", "strategy"] {
            old.as_object_mut().unwrap().remove(key);
        }
        let blob = protection::encrypt(&serde_json::to_vec(&old).unwrap()).unwrap();
        let c = Connection::open(&path).unwrap();
        c.execute_batch("CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY)")
            .unwrap();
        c.execute_batch(include_str!("../migrations/001.sql"))
            .unwrap();
        c.execute("INSERT INTO downloads VALUES('old',?1)", params![&blob])
            .unwrap();
        drop(c);
        let store = Store::open(&path).unwrap();
        let loaded = store.load().unwrap();
        assert_eq!(loaded.jobs.len(), 1);
        assert_eq!(loaded.jobs[0].id, "old");
        assert!(loaded.jobs[0].ranges.is_empty());
        let unchanged: Vec<u8> = store
            .connection
            .query_row(
                "SELECT protected_job FROM downloads WHERE id='old'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(unchanged, blob);
        assert_eq!(store.limits().unwrap(), Default::default());
    }
}
