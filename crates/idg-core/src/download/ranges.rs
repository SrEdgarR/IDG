//! Half-open ranges, bounded metadata and hashes of durable ranges only.
use super::*;

pub const MIN_RANGE: u64 = 1024 * 1024;
pub const MAX_RANGES: u64 = 4096;

#[derive(Clone, Serialize, Deserialize, Debug, PartialEq, Eq)]
pub struct DurableRange {
    pub start: u64,
    pub end: u64,
    pub sha256: Option<String>,
}

pub fn plan(
    total: u64,
    prefix: u64,
    prefix_hash: &str,
) -> Result<Vec<DurableRange>, DownloadError> {
    if prefix > total {
        return Err(DownloadError::InvalidRange);
    }
    let mut ranges = Vec::new();
    if prefix > 0 {
        ranges.push(DurableRange {
            start: 0,
            end: prefix,
            sha256: Some(prefix_hash.into()),
        });
    }
    let remaining = total - prefix;
    let slots = MAX_RANGES - ranges.len() as u64;
    let size = remaining.div_ceil(slots).max(MIN_RANGE);
    let mut start = prefix;
    while start < total {
        let end = start.saturating_add(size).min(total);
        ranges.push(DurableRange {
            start,
            end,
            sha256: None,
        });
        start = end;
    }
    validate(&ranges, total)?;
    Ok(ranges)
}

pub fn validate(ranges: &[DurableRange], total: u64) -> Result<(), DownloadError> {
    if ranges.len() > MAX_RANGES as usize {
        return Err(DownloadError::InvalidRange);
    }
    let mut cursor = 0;
    for r in ranges {
        if r.start != cursor || r.end <= r.start || r.end > total {
            return Err(DownloadError::InvalidRange);
        }
        if r.sha256
            .as_ref()
            .is_some_and(|h| h.len() != 64 || !h.bytes().all(|b| b.is_ascii_hexdigit()))
        {
            return Err(DownloadError::PartialChanged);
        }
        cursor = r.end;
    }
    if cursor != total {
        return Err(DownloadError::InvalidRange);
    }
    Ok(())
}

pub fn durable(ranges: &[DurableRange]) -> u64 {
    ranges
        .iter()
        .filter(|r| r.sha256.is_some())
        .map(|r| r.end - r.start)
        .sum()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn generated_coverage_and_boundaries() {
        let mut seed = 13u64;
        let mut sizes = vec![
            0,
            1,
            MIN_RANGE - 1,
            MIN_RANGE,
            MIN_RANGE + 1,
            u32::MAX as u64,
            u64::MAX - 1,
            u64::MAX,
        ];
        for _ in 0..2000 {
            seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1);
            sizes.push(seed);
        }
        for total in sizes {
            for prefix in [0, total / 3, total] {
                let ranges = plan(total, prefix, &"0".repeat(64)).unwrap();
                validate(&ranges, total).unwrap();
                assert!(ranges.len() <= 4096);
                assert_eq!(durable(&ranges), prefix);
                assert_eq!(
                    ranges
                        .iter()
                        .map(|r| u128::from(r.end - r.start))
                        .sum::<u128>(),
                    u128::from(total)
                );
            }
        }
    }
    #[test]
    fn overlap_gap_and_invalid_prefix_rejected() {
        assert!(plan(3, 4, "").is_err());
        for start in [0, 2] {
            assert!(
                validate(
                    &[
                        DurableRange {
                            start: 0,
                            end: 1,
                            sha256: None
                        },
                        DurableRange {
                            start,
                            end: 3,
                            sha256: None
                        }
                    ],
                    3
                )
                .is_err()
            );
        }
    }
}
