CREATE TABLE image_references (
  id INTEGER PRIMARY KEY,
  lot_id INTEGER NOT NULL REFERENCES lots(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  file_size INTEGER NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  label TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_image_references_lot_id ON image_references(lot_id);

CREATE TABLE resources (
  id INTEGER PRIMARY KEY,
  lot_id INTEGER NOT NULL REFERENCES lots(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('image_hd', 'video', 'pdf', 'text', 'link')),
  title TEXT NOT NULL,
  body TEXT,
  file_path TEXT,
  file_size INTEGER NOT NULL DEFAULT 0,
  mime_type TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_resources_lot_id ON resources(lot_id);
