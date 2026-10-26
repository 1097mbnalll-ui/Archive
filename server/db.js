// قاعدة البيانات: ملف SQLite واحد داخل مجلد data (ما ينرفع على GitHub).
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'editor', 'viewer')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  csrf TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS people (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS collections (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('album', 'occasion')),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'photo' CHECK (kind IN ('photo', 'document')),
  title TEXT NOT NULL DEFAULT '',
  story TEXT NOT NULL DEFAULT '',
  date_text TEXT NOT NULL DEFAULT '',
  year INTEGER,
  place TEXT NOT NULL DEFAULT '',
  album_id INTEGER REFERENCES collections(id),
  occasion_id INTEGER REFERENCES collections(id),
  privacy TEXT NOT NULL DEFAULT 'family' CHECK (privacy IN ('public', 'family')),
  file_name TEXT NOT NULL,
  original_name TEXT NOT NULL DEFAULT '',
  mime TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  size INTEGER NOT NULL,
  uploaded_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS item_people (
  item_id INTEGER NOT NULL REFERENCES items(id),
  person_id INTEGER NOT NULL REFERENCES people(id),
  PRIMARY KEY (item_id, person_id)
);

CREATE INDEX IF NOT EXISTS items_created ON items(created_at);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
`;

// حسابين مشتركين: واحد لكلمة سر الزوار، وواحد لكلمة سر المدير.
// ما يدخلون باسم مستخدم، وكلمة السر حقهم "disabled" لين يحددها المدير.
const SHARED_ACCOUNTS = [
  { shared: 'visitor', username: '~visitor', display_name: 'زائر العائلة', role: 'viewer' },
  { shared: 'admin', username: '~admin', display_name: 'المدير', role: 'admin' }
];

// تحديثات على قاعدة بيانات موجودة: تضيف الأعمدة الجديدة بدون ما تمس البيانات.
function migrate(db) {
  const columns = (table) => db.prepare('PRAGMA table_info(' + table + ')').all().map((c) => c.name);
  if (!columns('users').includes('shared')) db.exec('ALTER TABLE users ADD COLUMN shared TEXT');
  const sessionCols = columns('sessions');
  if (!sessionCols.includes('ip')) db.exec("ALTER TABLE sessions ADD COLUMN ip TEXT NOT NULL DEFAULT ''");
  if (!sessionCols.includes('user_agent')) db.exec("ALTER TABLE sessions ADD COLUMN user_agent TEXT NOT NULL DEFAULT ''");
  const insert = db.prepare("INSERT INTO users (username, display_name, password_hash, role, shared) VALUES (?, ?, 'disabled', ?, ?)");
  for (const a of SHARED_ACCOUNTS) {
    if (!db.prepare('SELECT 1 FROM users WHERE shared = ?').get(a.shared)) insert.run(a.username, a.display_name, a.role, a.shared);
  }
}

// أسماء الأشخاص الأولى، نفس اللي في الموقع التجريبي.
const STARTER_PEOPLE = ['الجد', 'الجدة', 'الوالد', 'الوالدة', 'العم', 'العمة', 'الخال', 'الخالة'];

function openDb(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, 'archive.db'));
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  migrate(db);
  if (db.prepare('SELECT COUNT(*) AS n FROM people').get().n === 0) {
    const insert = db.prepare('INSERT INTO people (name) VALUES (?)');
    for (const name of STARTER_PEOPLE) insert.run(name);
  }
  return db;
}

// ينفّذ مجموعة أوامر كوحدة وحدة: كلها تنجح أو ولا وحدة.
function transaction(db, fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

module.exports = { openDb, transaction };
