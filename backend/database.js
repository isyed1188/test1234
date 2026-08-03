import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, 'autoapply.db'));

db.exec(`
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  external_id TEXT UNIQUE,
  source TEXT,
  title TEXT,
  company TEXT,
  location TEXT,
  work_mode TEXT,
  experience_level TEXT,
  salary_min INTEGER,
  salary_max INTEGER,
  salary_currency TEXT,
  url TEXT,
  description TEXT,
  skills TEXT,
  category TEXT,
  relevance_score INTEGER DEFAULT 0,
  fetched_at TEXT
);

CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER,
  status TEXT DEFAULT 'PENDING',
  portal TEXT,
  resume_id INTEGER,
  notes TEXT,
  applied_at TEXT,
  created_at TEXT,
  FOREIGN KEY(job_id) REFERENCES jobs(id),
  FOREIGN KEY(resume_id) REFERENCES resumes(id)
);

CREATE TABLE IF NOT EXISTS resumes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  filename TEXT,
  original_name TEXT,
  format TEXT,
  content TEXT,
  is_baseline INTEGER DEFAULT 0,
  tailored_for_job_id INTEGER,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  level TEXT,
  message TEXT,
  ts TEXT
);
`);

export function all(sql, params = []) {
  return db.prepare(sql).all(...params);
}

export function get(sql, params = []) {
  return db.prepare(sql).get(...params);
}

export function run(sql, params = []) {
  const result = db.prepare(sql).run(...params);
  return { lastInsertRowid: Number(result.lastInsertRowid), changes: Number(result.changes) };
}

export function log(level, message) {
  if (level === 'error') console.error(`[${level}] ${message}`);
  try {
    run('INSERT INTO logs (level, message, ts) VALUES (?, ?, ?)', [level, message, new Date().toISOString()]);
    const MAX = 2000;
    const count = get('SELECT COUNT(*) AS c FROM logs');
    if (count.c > MAX) {
      run('DELETE FROM logs WHERE id NOT IN (SELECT id FROM logs ORDER BY id DESC LIMIT ?)', [MAX]);
    }
  } catch (err) {
    console.error(`[log] could not persist log entry (${level}: ${message}): ${err.message}`);
  }
}

export function getSetting(key, fallback = null) {
  const row = get('SELECT value FROM settings WHERE key = ?', [key]);
  if (!row) return fallback;
  try {
    return JSON.parse(row.value);
  } catch {
    return row.value;
  }
}

export function setSetting(key, value) {
  const json = typeof value === 'string' ? JSON.stringify(value) : JSON.stringify(value);
  run(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, json]
  );
}

export default db;
