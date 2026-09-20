CREATE TABLE app_preferences(id INTEGER PRIMARY KEY CHECK(id=1), protected_value BLOB NOT NULL);
INSERT INTO schema_migrations VALUES(3);
