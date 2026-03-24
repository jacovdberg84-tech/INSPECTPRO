-- ============================================
-- InspectPro Tables (CLEAN - no duplicates)
-- ============================================

-- Enable foreign keys (redundant but safe)
PRAGMA foreign_keys = ON;

-- Inspections captured by operators
CREATE TABLE IF NOT EXISTS inspections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER NOT NULL,          
  operator_name TEXT NOT NULL,
  inspection_date TEXT NOT NULL DEFAULT (DATE('now')),
  status TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'attention', 'unsafe')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_inspections_date ON inspections(inspection_date);
CREATE INDEX IF NOT EXISTS idx_inspections_asset ON inspections(asset_id);
CREATE INDEX IF NOT EXISTS idx_inspections_status ON inspections(status);

-- Photos linked to inspections
CREATE TABLE IF NOT EXISTS inspection_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inspection_id INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (inspection_id) REFERENCES inspections(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_photos_inspection ON inspection_photos(inspection_id);

-- Faults created when status != 'ok'
CREATE TABLE IF NOT EXISTS faults (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER NOT NULL,          
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  inspection_id INTEGER,              
  FOREIGN KEY (inspection_id) REFERENCES inspections(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_faults_status ON faults(status);
CREATE INDEX IF NOT EXISTS idx_faults_asset ON faults(asset_id);

-- Operator machine allocations
CREATE TABLE IF NOT EXISTS asset_allocations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER NOT NULL,          
  operator_name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  allocated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(asset_id, operator_name, active)
);

CREATE INDEX IF NOT EXISTS idx_allocations_operator ON asset_allocations(operator_name, active);
CREATE INDEX IF NOT EXISTS idx_allocations_asset ON asset_allocations(asset_id);