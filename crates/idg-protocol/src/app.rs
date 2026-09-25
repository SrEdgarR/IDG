use crate::{DownloadError, NewDownload, TransferOptions};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum StartPolicy {
    Now,
    Later,
    Queue,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct CreateDownload {
    #[serde(default)]
    pub context: String,
    #[serde(default)]
    pub private: bool,
    #[serde(default)]
    pub apply_rules: bool,
    #[serde(default)]
    pub rule_overrides: Vec<String>,
    #[serde(default = "crate::default_queue_id")]
    pub queue_id: String,
    pub input: NewDownload,
    pub options: TransferOptions,
    pub category: String,
    pub start: StartPolicy,
}
impl CreateDownload {
    pub fn validate(&self) -> Result<(), DownloadError> {
        self.options.validate()?;
        if self.context.len() > 128 || self.context.chars().any(char::is_control) {
            return Err(DownloadError::InvalidInput);
        }
        if self.category.trim().is_empty()
            || self.category.len() > 120
            || self.category.chars().any(char::is_control)
            || self.rule_overrides.len() > 5
            || self.rule_overrides.iter().any(|s| {
                ![
                    "directory",
                    "category",
                    "queue_id",
                    "bytes_per_second",
                    "priority",
                ]
                .contains(&s.as_str())
            })
        {
            return Err(DownloadError::InvalidInput);
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq)]
#[serde(default, deny_unknown_fields)]
pub struct AppPreferences {
    pub welcome_done: bool,
    pub directory: String,
    pub theme: String,
    pub view: String,
    pub close_action: String,
    pub autopick_mode: String,
    pub notify_completed: bool,
    pub notify_failed: bool,
    pub mini_window: bool,
    pub drop_target: bool,
    pub queue_running: bool,
}
impl Default for AppPreferences {
    fn default() -> Self {
        Self {
            welcome_done: false,
            directory: String::new(),
            theme: "system".into(),
            view: "Automática".into(),
            close_action: "hide".into(),
            autopick_mode: "ask".into(),
            notify_completed: true,
            notify_failed: true,
            mini_window: false,
            drop_target: false,
            queue_running: false,
        }
    }
}
impl AppPreferences {
    pub fn validate(&self) -> Result<(), DownloadError> {
        if !["system", "light", "dark"].contains(&self.theme.as_str())
            || !["Automática", "Compacta", "Expandida"].contains(&self.view.as_str())
            || !["hide", "exit", "ask"].contains(&self.close_action.as_str())
            || !["always", "ask", "browser"].contains(&self.autopick_mode.as_str())
            || self.directory.len() > 4096
            || (!self.directory.is_empty()
                && (!std::path::Path::new(&self.directory).is_absolute()
                    || self.directory.starts_with("\\\\")))
        {
            return Err(DownloadError::InvalidInput);
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn draft() -> CreateDownload {
        CreateDownload {
            context: "manual".into(),
            private: false,
            apply_rules: false,
            rule_overrides: Vec::new(),
            queue_id: "main".into(),
            input: NewDownload {
                url: "https://example.org/file.bin".into(),
                directory: "C:\\Downloads".into(),
                name: "file.bin".into(),
                expected_sha256: None,
                conflict: crate::ConflictPolicy::Reject,
            },
            options: TransferOptions::default(),
            category: "Otros".into(),
            start: StartPolicy::Later,
        }
    }

    #[test]
    fn create_download_validates_context_categories_and_explicit_rule_overrides() {
        assert_eq!(draft().validate(), Ok(()));

        let mut candidate = draft();
        candidate.context = "x".repeat(128);
        assert_eq!(candidate.validate(), Ok(()));
        candidate.context.push('x');
        assert_eq!(candidate.validate(), Err(DownloadError::InvalidInput));

        for category in [
            String::new(),
            "  ".into(),
            "x".repeat(121),
            "bad\nname".into(),
        ] {
            let mut candidate = draft();
            candidate.category = category;
            assert_eq!(candidate.validate(), Err(DownloadError::InvalidInput));
        }

        let mut allowed = draft();
        allowed.rule_overrides = [
            "directory",
            "category",
            "queue_id",
            "bytes_per_second",
            "priority",
        ]
        .map(str::to_owned)
        .to_vec();
        assert_eq!(allowed.validate(), Ok(()));

        for overrides in [vec!["shell".into()], vec!["directory".into(); 6]] {
            let mut candidate = draft();
            candidate.rule_overrides = overrides;
            assert_eq!(candidate.validate(), Err(DownloadError::InvalidInput));
        }
    }

    #[test]
    fn preferences_allow_only_known_modes_and_local_absolute_directories() {
        assert_eq!(AppPreferences::default().validate(), Ok(()));

        for candidate in [
            AppPreferences {
                theme: "auto".into(),
                ..Default::default()
            },
            AppPreferences {
                view: "dense".into(),
                ..Default::default()
            },
            AppPreferences {
                close_action: "terminate-all".into(),
                ..Default::default()
            },
            AppPreferences {
                autopick_mode: "silent".into(),
                ..Default::default()
            },
            AppPreferences {
                directory: "relative".into(),
                ..Default::default()
            },
            AppPreferences {
                directory: "\\\\server\\share".into(),
                ..Default::default()
            },
            AppPreferences {
                directory: "x".repeat(4097),
                ..Default::default()
            },
        ] {
            assert_eq!(candidate.validate(), Err(DownloadError::InvalidInput));
        }
        let unknown = serde_json::from_str::<AppPreferences>(r#"{"unexpected":true}"#);
        assert!(unknown.is_err());
    }
}
