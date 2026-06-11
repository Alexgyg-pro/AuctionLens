CREATE TABLE plans (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  max_active_sales INTEGER NOT NULL,
  max_lots_per_sale INTEGER NOT NULL,
  max_storage_mb INTEGER NOT NULL,
  price_monthly REAL NOT NULL
);

CREATE TABLE cabinets (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  plan_id INTEGER NOT NULL REFERENCES plans(id),
  subscription_status TEXT NOT NULL DEFAULT 'active'
    CHECK (subscription_status IN ('active', 'suspended')),
  subscription_expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'cabinet')),
  cabinet_id INTEGER REFERENCES cabinets(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_users_cabinet_id ON users(cabinet_id);
CREATE INDEX idx_cabinets_plan_id ON cabinets(plan_id);
