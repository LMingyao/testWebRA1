-- Content is one ordered aggregate, matching the editor's atomic Save operation.
-- Images stay in GitHub; only validated references enter D1.
CREATE TABLE gallery_content (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  revision TEXT NOT NULL,
  document TEXT NOT NULL CHECK (json_valid(document) AND length(document) <= 1000000),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE gallery_media (
  path TEXT PRIMARY KEY,
  digest TEXT,
  bytes INTEGER NOT NULL CHECK (bytes >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE gallery_history (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  revision TEXT NOT NULL,
  document TEXT NOT NULL,
  saved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER gallery_keep_history AFTER UPDATE ON gallery_content BEGIN
  INSERT INTO gallery_history(revision, document) VALUES (OLD.revision, OLD.document);
  DELETE FROM gallery_history WHERE sequence NOT IN
    (SELECT sequence FROM gallery_history ORDER BY sequence DESC LIMIT 20);
END;
-- Read-only views make the aggregate easy to inspect with SQL.
CREATE VIEW gallery_photos AS
  SELECT json_extract(value, '$.id') AS id,
    json_extract(value, '$.category') AS category,
    json_extract(value, '$.published') AS published,
    json_extract(value, '$.homeSelected') AS home_selected,
    json_extract(value, '$.placement') AS placement,
    CAST(key AS INTEGER) AS position, value AS document
  FROM gallery_content, json_each(gallery_content.document, '$.photos');
CREATE VIEW gallery_categories AS
  SELECT json_extract(value, '$.id') AS id,
    json_extract(value, '$.label') AS label, CAST(key AS INTEGER) AS position
  FROM gallery_content, json_each(gallery_content.document, '$.categories');
