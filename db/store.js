// SQLite-backed data store, built on Node's built-in `node:sqlite` module.
// No native compilation and no npm dependency required (unlike better-sqlite3,
// which failed to install in a network-restricted environment earlier) -
// this ships inside Node itself from v22.5 onward.
//
// The public API (all/find/where/insert/update/remove) is intentionally
// identical to the old JSON-file store it replaces, so no route or lib file
// anywhere in the app had to change - only what's underneath this file did.

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

// DATA_DIR lets a production host point the database at a persistent disk
// (e.g. Render's mounted volume) instead of the app folder itself, so the
// data survives deploys/restarts. Defaults to db/ for local development,
// where the app folder itself is already persistent.
const DATA_DIR = process.env.DATA_DIR || __dirname;
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_FILE = path.join(DATA_DIR, 'beron.db');
const LEGACY_JSON_FILE = path.join(__dirname, 'data.json');

const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA foreign_keys = ON;');

// Logical collection name (used everywhere in routes/lib) -> actual SQL
// table name underneath. Most match 1:1; a couple use snake_case in SQL.
const TABLES = {
  companies: 'companies',
  users: 'users',
  employees: 'employees',
  events: 'events',
  giftOrders: 'gift_orders',
  subscriptions: 'subscriptions',
  meetingRequests: 'meeting_requests'
};

// Columns that are real booleans in JS but stored as 0/1 in SQLite (which has
// no boolean type). Only these get converted back to true/false on read.
const BOOLEAN_FIELDS = {
  companies: ['email_notifications'],
  employees: ['active'],
  subscriptions: ['active']
};

function ensureSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      name TEXT,
      kennitala TEXT,
      subscription_plan TEXT,
      billing_email TEXT,
      billing_address TEXT,
      active_admin_count INTEGER,
      email_notifications INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      name TEXT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT,
      role TEXT,
      company_id INTEGER
    );

    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      company_id INTEGER,
      name TEXT,
      birthday TEXT,
      department TEXT,
      birthday_budget REAL,
      address TEXT,
      delivery_preference TEXT,
      shirt_size TEXT,
      preferences TEXT,
      notes TEXT,
      active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      company_id INTEGER,
      employee_id INTEGER,
      event_type TEXT,
      date TEXT,
      status TEXT,
      custom_label TEXT
    );

    CREATE TABLE IF NOT EXISTS gift_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      company_id INTEGER,
      employee_id INTEGER,
      event_id INTEGER,
      gift_type TEXT,
      budget_amount REAL,
      handling_fee REAL,
      delivery_date TEXT,
      status TEXT,
      fulfillment_method TEXT,
      delivery_method TEXT,
      notes TEXT,
      occasion TEXT
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      company_id INTEGER,
      plan_type TEXT,
      pricing_model TEXT,
      price_per_employee REAL,
      monthly_fee REAL,
      active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS meeting_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      name TEXT,
      company TEXT,
      email TEXT,
      phone TEXT,
      employee_range TEXT,
      message TEXT,
      status TEXT
    );
  `);
}

ensureSchema();

function toDbValue(value) {
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return value;
}

function fromDbRow(table, row) {
  if (!row) return row;
  const plain = Object.assign({}, row);
  (BOOLEAN_FIELDS[table] || []).forEach((field) => {
    if (field in plain) plain[field] = !!plain[field];
  });
  return plain;
}

// One-time migration from the previous JSON-file store, if it's still
// sitting there. Keeps every company/employee/order that had already been
// entered instead of starting over blank. Runs at most once - the old file
// gets renamed to data.json.migrated afterwards as a backup.
function migrateFromLegacyJson() {
  if (!fs.existsSync(LEGACY_JSON_FILE)) return;

  let data;
  try {
    data = JSON.parse(fs.readFileSync(LEGACY_JSON_FILE, 'utf-8'));
  } catch (e) {
    console.error('Gat ekki lesið gamla data.json fyrir flutning:', e.message);
    return;
  }

  const hasAnyRows = Object.keys(TABLES).some((t) => Array.isArray(data[t]) && data[t].length > 0);

  if (hasAnyRows) {
    console.log('Flyt gögn úr gamla data.json yfir í SQLite (db/beron.db)...');
    Object.keys(TABLES).forEach((table) => {
      const rows = Array.isArray(data[table]) ? data[table] : [];
      rows.forEach((row) => {
        const columns = Object.keys(row);
        const placeholders = columns.map(() => '?').join(', ');
        const values = columns.map((col) => toDbValue(row[col]));
        const sql = `INSERT OR IGNORE INTO ${TABLES[table]} (${columns.join(', ')}) VALUES (${placeholders})`;
        try {
          db.prepare(sql).run(...values);
        } catch (e) {
          console.error(`Flutningur mistókst fyrir ${table}#${row.id}:`, e.message);
        }
      });
    });
    console.log('Flutningi lokið - gamla data.json er vistað sem data.json.migrated (afrit).');
  }

  fs.renameSync(LEGACY_JSON_FILE, LEGACY_JSON_FILE + '.migrated');
}

migrateFromLegacyJson();

const store = {
  all(table) {
    const sqlTable = TABLES[table];
    const rows = db.prepare(`SELECT * FROM ${sqlTable}`).all();
    return rows.map((r) => fromDbRow(table, r));
  },

  find(table, id) {
    const sqlTable = TABLES[table];
    const row = db.prepare(`SELECT * FROM ${sqlTable} WHERE id = ?`).get(Number(id));
    return fromDbRow(table, row);
  },

  where(table, predicate) {
    return store.all(table).filter(predicate);
  },

  insert(table, obj) {
    const sqlTable = TABLES[table];
    const record = Object.assign({ created_at: new Date().toISOString() }, obj);
    const columns = Object.keys(record);
    const placeholders = columns.map(() => '?').join(', ');
    const values = columns.map((col) => toDbValue(record[col]));
    const result = db
      .prepare(`INSERT INTO ${sqlTable} (${columns.join(', ')}) VALUES (${placeholders})`)
      .run(...values);
    return store.find(table, result.lastInsertRowid);
  },

  update(table, id, patch) {
    const sqlTable = TABLES[table];
    const existing = store.find(table, id);
    if (!existing) return null;
    const columns = Object.keys(patch);
    if (columns.length === 0) return existing;
    const setClause = columns.map((col) => `${col} = ?`).join(', ');
    const values = columns.map((col) => toDbValue(patch[col]));
    db.prepare(`UPDATE ${sqlTable} SET ${setClause} WHERE id = ?`).run(...values, Number(id));
    return store.find(table, id);
  },

  remove(table, id) {
    const sqlTable = TABLES[table];
    const result = db.prepare(`DELETE FROM ${sqlTable} WHERE id = ?`).run(Number(id));
    return result.changes > 0;
  }
};

module.exports = store;
