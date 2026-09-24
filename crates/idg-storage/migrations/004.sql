CREATE TABLE organization(id INTEGER PRIMARY KEY CHECK(id=1), protected_value BLOB NOT NULL);
CREATE TABLE operation_receipts(id TEXT PRIMARY KEY, protected_value BLOB NOT NULL);
INSERT INTO schema_migrations(version) VALUES(4);
