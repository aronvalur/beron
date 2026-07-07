// Simple file-backed JSON data store.
// This avoids native module dependencies (e.g. sqlite bindings) so the app
// runs anywhere Node.js runs, with zero build step.

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data.json');

const EMPTY = {
  meta: { nextId: { companies: 1, users: 1, employees: 1, events: 1, giftOrders: 1, subscriptions: 1, meetingRequests: 1 } },
  companies: [],
  users: [],
  employees: [],
  events: [],
  giftOrders: [],
  subscriptions: [],
  meetingRequests: []
};

// Backfills any tables/nextId counters that didn't exist yet in an
// already-saved data.json (e.g. after adding a new collection like
// meetingRequests), so older data files keep working without a manual reset.
function withMigrations(data) {
  let changed = false;
  if (!data.meta) { data.meta = { nextId: {} }; changed = true; }
  if (!data.meta.nextId) { data.meta.nextId = {}; changed = true; }
  Object.keys(EMPTY.meta.nextId).forEach((table) => {
    if (!(table in data.meta.nextId)) { data.meta.nextId[table] = 1; changed = true; }
  });
  Object.keys(EMPTY).forEach((key) => {
    if (key === 'meta') return;
    if (!Array.isArray(data[key])) { data[key] = []; changed = true; }
  });
  if (changed) save(data);
  return data;
}

function load() {
  if (!fs.existsSync(DATA_FILE)) {
    save(EMPTY);
    return JSON.parse(JSON.stringify(EMPTY));
  }
  const raw = fs.readFileSync(DATA_FILE, 'utf-8');
  try {
    return withMigrations(JSON.parse(raw));
  } catch (e) {
    console.error('Corrupt data.json, reinitializing.', e);
    save(EMPTY);
    return JSON.parse(JSON.stringify(EMPTY));
  }
}

function save(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

const store = {
  all(table) {
    return load()[table];
  },
  find(table, id) {
    return load()[table].find((r) => r.id === Number(id));
  },
  where(table, predicate) {
    return load()[table].filter(predicate);
  },
  insert(table, obj) {
    const data = load();
    const id = data.meta.nextId[table] || 1;
    data.meta.nextId[table] = id + 1;
    const record = Object.assign({ id, created_at: new Date().toISOString() }, obj);
    data[table].push(record);
    save(data);
    return record;
  },
  update(table, id, patch) {
    const data = load();
    const idx = data[table].findIndex((r) => r.id === Number(id));
    if (idx === -1) return null;
    data[table][idx] = Object.assign({}, data[table][idx], patch);
    save(data);
    return data[table][idx];
  },
  remove(table, id) {
    const data = load();
    const before = data[table].length;
    data[table] = data[table].filter((r) => r.id !== Number(id));
    save(data);
    return data[table].length < before;
  }
};

module.exports = store;
