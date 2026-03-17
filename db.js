import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

// For Glitch compatibility, store database in the hidden .data folder so it doesn't get wiped
const isGlitch = process.env.PROJECT_DOMAIN !== undefined;
const dbDir = isGlitch ? '.data' : '.';

if (isGlitch && !fs.existsSync(dbDir)) {
    try { fs.mkdirSync(dbDir); } catch(e) {}
}

const dbPath = path.join(dbDir, 'shortlink.db');
const db = new Database(dbPath);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS links (
    id TEXT PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    default_url TEXT NOT NULL,
    title TEXT,
    description TEXT,
    thumbnail_url TEXT,
    is_wa_redirect BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    click_count INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS geo_rules (
    id TEXT PRIMARY KEY,
    link_id TEXT NOT NULL,
    country_code TEXT NOT NULL,
    target_url TEXT NOT NULL,
    FOREIGN KEY(link_id) REFERENCES links(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS clicks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    link_id TEXT NOT NULL,
    country TEXT,
    ip TEXT,
    user_agent TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(link_id) REFERENCES links(id) ON DELETE CASCADE
  );
`);

export default db;
