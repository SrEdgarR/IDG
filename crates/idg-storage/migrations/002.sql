CREATE TABLE settings (id INTEGER PRIMARY KEY CHECK (id = 1), protected_limits BLOB NOT NULL);
INSERT INTO schema_migrations(version) VALUES (2);
