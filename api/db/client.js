import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

// Get current file directory (ES modules)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from root (2 levels up from api/db/)
dotenv.config({ path: path.join(__dirname, '../../.env') });

// Resolve DB path (absolute)
const DB_PATH = process.env.DB_PATH 
  ? path.resolve(process.env.DB_PATH)
  : path.join(__dirname, '../../data/inspectpro.db');

console.log('DB Path:', DB_PATH);

// Create directory if missing
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
  console.log(`Created directory: ${dbDir}`);
}

// Open database
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

console.log(`Connected: ${DB_PATH}`);
console.log(`Foreign keys: ${db.pragma('foreign_keys', { simple: true })}`);

export { db };