-- Only jobs needed by phase 03. Queues/rules/segments are added in their phases.
CREATE TABLE downloads(id TEXT PRIMARY KEY, protected_job BLOB NOT NULL);
INSERT INTO schema_migrations(version) VALUES(1);
