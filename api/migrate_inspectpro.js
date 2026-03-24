import { db } from './db/client.js';

console.log('Starting migration...');

// Get list of existing tables
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
const tableNames = tables.map(t => t.name);
console.log('Existing tables:', tableNames);

// Check if inspections table exists
const hasInspections = tableNames.includes('inspections');

if (!hasInspections) {
  // Brand new database - just create tables fresh
  console.log('Fresh database - creating tables...');
  
  db.exec(`
    CREATE TABLE inspections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_id INTEGER NOT NULL,          
      operator_name TEXT NOT NULL,
      inspection_date TEXT NOT NULL DEFAULT (DATE('now')),
      status TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'attention', 'unsafe')),
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    
    CREATE TABLE inspection_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      inspection_id INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (inspection_id) REFERENCES inspections(id) ON DELETE CASCADE
    );
    
    CREATE TABLE faults (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_id INTEGER NOT NULL,          
      description TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
      inspection_id INTEGER,              
      FOREIGN KEY (inspection_id) REFERENCES inspections(id) ON DELETE SET NULL
    );
    
    CREATE TABLE asset_allocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_id INTEGER NOT NULL,          
      operator_name TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
      allocated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(asset_id, operator_name, active)
    );
  `);
  
  console.log('Tables created successfully!');
  
} else {
  // Existing database - check if migration needed
  const inspectionsInfo = db.prepare("PRAGMA table_info(inspections)").all();
  const hasCreatedAt = inspectionsInfo.some(c => c.name === 'created_at');
  
  if (!hasCreatedAt) {
    console.log('Migration needed: Fixing schema...');
    
    db.exec(`
      BEGIN TRANSACTION;
      
      -- Backup existing data
      CREATE TABLE inspections_backup AS SELECT * FROM inspections;
      
      -- Drop dependent tables first
      DROP TABLE IF EXISTS inspection_photos;
      DROP TABLE IF EXISTS faults;
      DROP TABLE IF EXISTS inspections;
      
      -- Create correct tables
      CREATE TABLE inspections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        asset_id INTEGER NOT NULL,          
        operator_name TEXT NOT NULL,
        inspection_date TEXT NOT NULL DEFAULT (DATE('now')),
        status TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'attention', 'unsafe')),
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      
      -- Restore data with defaults
      INSERT INTO inspections (id, asset_id, operator_name, inspection_date, status, notes)
      SELECT 
        id, 
        CAST(asset_id AS INTEGER), 
        COALESCE(operator_name, 'Unknown'), 
        COALESCE(inspection_date, DATE('now')), 
        COALESCE(status, 'ok'), 
        notes 
      FROM inspections_backup;
      
      DROP TABLE inspections_backup;
      
      CREATE TABLE inspection_photos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        inspection_id INTEGER NOT NULL,
        file_path TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (inspection_id) REFERENCES inspections(id) ON DELETE CASCADE
      );
      
      CREATE TABLE faults (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        asset_id INTEGER NOT NULL,          
        description TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
        inspection_id INTEGER,              
        FOREIGN KEY (inspection_id) REFERENCES inspections(id) ON DELETE SET NULL
      );
      
      COMMIT;
    `);
    
    console.log('Migration complete!');
  } else {
    console.log('Schema already up to date.');
  }
}

// Create/recreate indexes
console.log('Creating indexes...');
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_inspections_date ON inspections(inspection_date);
  CREATE INDEX IF NOT EXISTS idx_inspections_asset ON inspections(asset_id);
  CREATE INDEX IF NOT EXISTS idx_inspections_status ON inspections(status);
  CREATE INDEX IF NOT EXISTS idx_photos_inspection ON inspection_photos(inspection_id);
  CREATE INDEX IF NOT EXISTS idx_faults_status ON faults(status);
  CREATE INDEX IF NOT EXISTS idx_faults_asset ON faults(asset_id);
  CREATE INDEX IF NOT EXISTS idx_allocations_operator ON asset_allocations(operator_name, active);
  CREATE INDEX IF NOT EXISTS idx_allocations_asset ON asset_allocations(asset_id);
`);

console.log('Migration finished successfully!');