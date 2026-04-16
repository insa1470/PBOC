-- 徵信查詢系統 Database Schema

CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  auth_date TEXT NOT NULL,
  group_name TEXT DEFAULT '',
  sheet_name TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', '+8 hours')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', '+8 hours'))
);

CREATE TABLE IF NOT EXISTS operators (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', '+8 hours'))
);

CREATE TABLE IF NOT EXISTS batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  requester_name TEXT NOT NULL,
  operator_name TEXT NOT NULL,
  created_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', '+8 hours'))
);

CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER NOT NULL REFERENCES batches(id),
  company_id INTEGER REFERENCES companies(id),
  company_name TEXT NOT NULL,
  company_auth_date TEXT DEFAULT '',
  purpose TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  completed_by TEXT,
  completed_at TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', '+8 hours'))
);

CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL,
  role TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT DEFAULT '',
  created_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', '+8 hours'))
);

CREATE TABLE IF NOT EXISTS admin (
  id INTEGER PRIMARY KEY DEFAULT 1,
  username TEXT NOT NULL DEFAULT 'admin',
  password_hash TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_companies_name ON companies(name);
CREATE INDEX IF NOT EXISTS idx_items_batch ON items(batch_id);
CREATE INDEX IF NOT EXISTS idx_items_status ON items(status);
CREATE INDEX IF NOT EXISTS idx_logs_created ON logs(created_at DESC);
