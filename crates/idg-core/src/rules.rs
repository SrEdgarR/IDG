//! Deterministic metadata-only rules. Never performs HTTP or filesystem mutations.
use idg_protocol::{OrganizationRule, RuleEffect, RulePreview};

pub struct Facts<'a> {
    pub url: &'a str,
    pub name: &'a str,
    pub size: Option<u64>,
    pub media_type: Option<&'a str>,
    pub utc_minute: u32,
}
pub fn evaluate(
    rules: &[OrganizationRule],
    facts: &Facts<'_>,
    overrides: &[String],
) -> RulePreview {
    let mut result = RulePreview {
        matched: Vec::new(),
        explanations: Vec::new(),
        effect: RuleEffect::default(),
    };
    let domain = reqwest::Url::parse(facts.url)
        .ok()
        .and_then(|u| u.host_str().map(str::to_ascii_lowercase))
        .unwrap_or_default();
    let extension = facts
        .name
        .rsplit_once('.')
        .map(|(_, s)| s.to_ascii_lowercase())
        .unwrap_or_default();
    let mut ordered: Vec<_> = rules.iter().filter(|r| r.enabled).collect();
    ordered.sort_by_key(|r| (r.rank, &r.id));
    for rule in ordered {
        let time_matches = rule
            .from_minute
            .zip(rule.until_minute)
            .is_none_or(|(a, b)| {
                if a < b {
                    facts.utc_minute >= a && facts.utc_minute < b
                } else {
                    facts.utc_minute >= a || facts.utc_minute < b
                }
            });
        let matches = (rule.domain.is_empty() || domain == rule.domain.to_ascii_lowercase())
            && (rule.extension.is_empty() || extension == rule.extension.to_ascii_lowercase())
            && (rule.media_type.is_empty()
                || facts
                    .media_type
                    .is_some_and(|s| s.eq_ignore_ascii_case(&rule.media_type)))
            && rule
                .min_bytes
                .is_none_or(|n| facts.size.is_some_and(|s| s >= u64::from(n)))
            && rule
                .max_bytes
                .is_none_or(|n| facts.size.is_some_and(|s| s <= u64::from(n)))
            && time_matches;
        if !matches {
            if (rule.min_bytes.is_some() || rule.max_bytes.is_some()) && facts.size.is_none() {
                result
                    .explanations
                    .push(format!("{}: no coincide; tamaño desconocido.", rule.name));
            }
            if !rule.media_type.is_empty() && facts.media_type.is_none() {
                result.explanations.push(format!(
                    "{}: no coincide; tipo HTTP desconocido.",
                    rule.name
                ));
            }
            continue;
        }
        result.matched.push(rule.id.clone());
        macro_rules! field {
            ($field:ident) => {
                if let Some(value) = &rule.effect.$field {
                    let key = stringify!($field);
                    if overrides.iter().any(|s| s == key) {
                        result.explanations.push(format!(
                            "{}: {} conserva tu elección explícita.",
                            rule.name, key
                        ));
                    } else if result.effect.$field.is_none() {
                        result.effect.$field = Some(value.clone());
                        result.explanations.push(format!(
                            "{}: prevalece para {} (orden {}).",
                            rule.name, key, rule.rank
                        ));
                    } else {
                        result.explanations.push(format!(
                            "{}: {} ya lo decide una regla anterior.",
                            rule.name, key
                        ));
                    }
                }
            };
        }
        field!(directory);
        field!(category);
        field!(queue_id);
        field!(bytes_per_second);
        field!(priority);
    }
    result
}
#[cfg(test)]
mod tests {
    use super::*;
    fn rule(id: &str, rank: u32) -> OrganizationRule {
        OrganizationRule {
            id: id.into(),
            name: id.into(),
            enabled: true,
            rank,
            domain: "example.org".into(),
            extension: "txt".into(),
            media_type: String::new(),
            min_bytes: None,
            max_bytes: None,
            from_minute: None,
            until_minute: None,
            effect: RuleEffect {
                category: Some(id.into()),
                ..Default::default()
            },
        }
    }
    #[test]
    fn stable_precedence_unknown_is_not_zero_and_explicit_choice_wins() {
        let facts = Facts {
            url: "https://example.org/file?token=fixture",
            name: "File.TXT",
            size: None,
            media_type: None,
            utc_minute: 30,
        };
        let a = rule("a", 1);
        let mut b = rule("b", 0);
        b.max_bytes = Some(1);
        let result = evaluate(&[b.clone(), a.clone()], &facts, &[]);
        assert_eq!(result.effect.category.as_deref(), Some("a"));
        b.max_bytes = None;
        assert_eq!(
            evaluate(&[a.clone(), b.clone()], &facts, &[])
                .effect
                .category
                .as_deref(),
            Some("b")
        );
        assert_eq!(
            evaluate(&[b], &facts, &["category".into()]).effect.category,
            None
        );
        let mut mime = a;
        mime.media_type = "text/plain".into();
        assert!(evaluate(&[mime], &facts, &[]).matched.is_empty());
    }
    #[test]
    fn overnight_window_and_exact_domain_do_not_match_subdomain() {
        let mut r = rule("night", 0);
        r.from_minute = Some(1380);
        r.until_minute = Some(60);
        let mut facts = Facts {
            url: "https://example.org/f",
            name: "a.txt",
            size: Some(0),
            media_type: None,
            utc_minute: 30,
        };
        assert_eq!(evaluate(&[r.clone()], &facts, &[]).matched.len(), 1);
        facts.utc_minute = 60;
        assert!(evaluate(&[r.clone()], &facts, &[]).matched.is_empty());
        facts.utc_minute = 30;
        facts.url = "https://sub.example.org/f";
        assert!(evaluate(&[r], &facts, &[]).matched.is_empty());
    }
}
