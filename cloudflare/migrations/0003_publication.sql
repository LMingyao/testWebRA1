-- Track external publication separately from the authoritative D1 save.
CREATE TABLE gallery_publication (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  revision TEXT NOT NULL,
  status TEXT NOT NULL,
  commit_sha TEXT,
  message TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE gallery_publish_lock (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  owner TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
