CREATE TABLE sales (
  id INTEGER PRIMARY KEY,
  cabinet_id INTEGER NOT NULL REFERENCES cabinets(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  event_date TEXT,
  location TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  recognition_threshold REAL NOT NULL DEFAULT 0.55,
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_sales_cabinet_id ON sales(cabinet_id);
CREATE INDEX idx_sales_status ON sales(status);

CREATE TABLE lots (
  id INTEGER PRIMARY KEY,
  sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  lot_number TEXT NOT NULL,
  title TEXT NOT NULL,
  artist TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  estimate_low REAL,
  estimate_high REAL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (sale_id, lot_number)
);

CREATE INDEX idx_lots_sale_id ON lots(sale_id);
