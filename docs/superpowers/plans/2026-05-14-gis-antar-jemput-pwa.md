# GIS Antar Jemput PWA — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a zero-build PWA that records school pickup/delivery trips per kid, debits a per-driver deposit at a daily rate, supports top-ups and history, and works fully offline using IndexedDB.

**Architecture:** Vanilla HTML + Alpine.js (CDN) for views, Dexie.js (CDN) wrapping IndexedDB for storage. Pure action functions live in `js/actions/*.js` and operate on a Dexie instance — this seam lets tests construct a fresh DB per case. An Alpine `$store` in `js/store.js` wires the actions to reactive UI state. A hash router (`#/`, `#/drivers`, `#/drivers/:id`, `#/kids`) switches between four templates inlined in `index.html`. Service worker (`sw.js`) caches the shell plus CDN URLs for offline use.

**Tech Stack:** HTML, CSS, ES Modules (browser-native, no bundler), Alpine.js 3, Dexie.js 4, Service Worker API, IndexedDB.

---

## File structure

```
gis-antar-jemput/
  index.html        # shell, CDN tags, Alpine x-templates for the four views
  style.css         # existing styles plus additions for cards, tabs, banner, modal
  sw.js             # ASSETS list extended; CACHE_NAME bumped; skipWaiting + claim
  manifest.json     # unchanged
  icon.png          # unchanged
  js/
    db.js           # createDb(name) factory; default `db` instance
    format.js       # rupiah, fmtDate, isSameLocalDay, todayIso
    router.js       # hashchange router → calls Alpine store routeChanged(route)
    store.js        # Alpine store: reactive state + thin wrappers over actions
    app.js          # boots SW, Alpine init, store init, router start
    actions/
      drivers.js    # addDriver, updateDriver, archiveDriver, deleteDriver, listDrivers
      kids.js       # addKid, updateKid, reassignKid, deleteKid, listKids
      log-leg.js    # logLeg(db, kidId, type)
      top-up.js     # topUp(db, driverId, amount, note)
      history.js    # listHistory(db, driverId), deleteTrip, deleteTopup
      monthly.js    # monthlySummary(db, driverId, year, month)
      sanity.js     # recomputeDeposits(db)
  tests.html        # in-browser test runner page
  tests/
    harness.js      # assert(), describe(), runAll() with red/green output
    format.test.js
    drivers.test.js
    kids.test.js
    log-leg.test.js
    top-up.test.js
    history.test.js
    monthly.test.js
    sanity.test.js
    router.test.js
  docs/
    uat.md          # manual UAT checklist
```

**Why this layout:** action modules each own one verb-family; the `db` parameter is injected so tests can pass a fresh `Dexie('test-…')` instance without monkey-patching. `store.js` stays small — UI state + thin calls.

---

## Conventions used in every task

- ES modules (`<script type="module">`). Dexie and Alpine are loaded via classic `<script>` tags before modules and read via `globalThis.Dexie` / `globalThis.Alpine`.
- Money: integers in rupiah only. Never floats.
- Dates: stored as ISO strings via `new Date().toISOString()`. Display via helpers in `format.js`.
- Every multi-write goes through `db.transaction('rw', ..., async () => { ... })`.
- Every action returns the changed/new row(s) so callers can update local state without re-reading.
- Tests open a fresh DB: `const db = createDb('test-' + crypto.randomUUID())` and call `await db.delete()` in a `finally` block.

---

## Task 1: Skeleton — folders, CDN tags, module loader

**Files:**
- Create: `js/app.js`
- Create: `js/db.js` (stub)
- Modify: `index.html` (entire file)
- Modify: `sw.js` (ASSETS list + CACHE_NAME)

- [ ] **Step 1: Create folder structure**

```bash
mkdir -p js/actions tests docs
```

- [ ] **Step 2: Replace `index.html` with the shell**

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>GIS Antar Jemput</title>
    <link rel="stylesheet" href="style.css">
    <link rel="manifest" href="manifest.json">
    <meta name="theme-color" content="#0f172a">
    <link rel="apple-touch-icon" href="icon.png">
    <style>@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap');</style>
    <script src="https://unpkg.com/dexie@4.0.8/dist/dexie.min.js"></script>
    <script defer src="https://unpkg.com/alpinejs@3.14.1/dist/cdn.min.js"></script>
</head>
<body x-data x-cloak>
    <header>
        <h1>GIS Antar Jemput</h1>
    </header>
    <main id="app">
        <div x-show="$store.app.ready === false">Loading…</div>
        <div x-show="$store.app.ready" id="view-root"></div>
    </main>
    <nav id="tabbar">
        <a href="#/" data-route="/">Home</a>
        <a href="#/drivers" data-route="/drivers">Drivers</a>
        <a href="#/kids" data-route="/kids">Kids</a>
    </nav>
    <div id="toast-root" x-data="$store.toast" x-show="visible" x-text="message"></div>
    <script type="module" src="js/app.js"></script>
</body>
</html>
```

- [ ] **Step 3: Create `js/db.js` stub**

```js
export function createDb(name) {
  const db = new globalThis.Dexie(name);
  db.version(1).stores({
    drivers: '++id, name, createdAt, archived',
    kids:    '++id, name, driverId, createdAt',
    trips:   '++id, driverId, kidId, type, occurredAt',
    topups:  '++id, driverId, occurredAt'
  });
  return db;
}
export const db = createDb('gis-antar-jemput');
```

- [ ] **Step 4: Create `js/app.js` boot stub**

```js
import { db } from './db.js';

async function boot() {
  await db.open();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW failed', err));
  }
  document.body.removeAttribute('x-cloak');
  console.log('Boot complete');
}
boot().catch(err => {
  document.getElementById('view-root').textContent = 'Startup error: ' + err.message;
});
```

- [ ] **Step 5: Update `sw.js`**

```js
const CACHE_NAME = 'gis-pwa-v2';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './manifest.json',
  './icon.png',
  './js/app.js',
  './js/db.js',
  './js/format.js',
  './js/router.js',
  './js/store.js',
  './js/actions/drivers.js',
  './js/actions/kids.js',
  './js/actions/log-leg.js',
  './js/actions/top-up.js',
  './js/actions/history.js',
  './js/actions/monthly.js',
  './js/actions/sanity.js',
  'https://unpkg.com/dexie@4.0.8/dist/dexie.min.js',
  'https://unpkg.com/alpinejs@3.14.1/dist/cdn.min.js'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(ASSETS)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  e.respondWith(caches.match(e.request).then((res) => res || fetch(e.request)));
});
```

- [ ] **Step 6: Manual smoke**

Open `index.html` in a browser. DevTools Console should show `Boot complete`. Application → IndexedDB should show database `gis-antar-jemput` with four object stores.

- [ ] **Step 7: Commit**

```bash
git add index.html sw.js js/
git commit -m "Skeleton: Dexie schema, CDN libs, ES module boot"
```

---

## Task 2: Test harness page

**Files:**
- Create: `tests.html`
- Create: `tests/harness.js`

- [ ] **Step 1: Create `tests/harness.js`**

```js
const tests = [];
let currentSuite = null;

export function describe(name, fn) {
  currentSuite = name;
  fn();
  currentSuite = null;
}

export function it(name, fn) {
  tests.push({ suite: currentSuite, name, fn });
}

export function assertEqual(actual, expected, msg = '') {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg} expected ${e}, got ${a}`);
}

export function assertThrows(fn, matcher) {
  try { fn(); } catch (err) {
    if (matcher && !String(err.message).includes(matcher)) {
      throw new Error(`expected error containing "${matcher}", got "${err.message}"`);
    }
    return;
  }
  throw new Error('expected function to throw');
}

export async function assertRejects(promise, matcher) {
  try { await promise; } catch (err) {
    if (matcher && !String(err.message).includes(matcher)) {
      throw new Error(`expected rejection containing "${matcher}", got "${err.message}"`);
    }
    return;
  }
  throw new Error('expected promise to reject');
}

export async function runAll(root) {
  let pass = 0, fail = 0;
  for (const t of tests) {
    const row = document.createElement('div');
    row.className = 'test-row';
    row.textContent = `${t.suite ? t.suite + ' › ' : ''}${t.name}`;
    root.appendChild(row);
    try {
      await t.fn();
      row.classList.add('pass');
      row.textContent = '✓ ' + row.textContent;
      pass++;
    } catch (err) {
      row.classList.add('fail');
      row.textContent = '✗ ' + row.textContent + ' — ' + err.message;
      console.error(err);
      fail++;
    }
  }
  const summary = document.createElement('div');
  summary.className = 'summary';
  summary.textContent = `${pass} passed, ${fail} failed`;
  root.appendChild(summary);
}
```

- [ ] **Step 2: Create `tests.html`**

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Tests</title>
  <style>
    body { font-family: monospace; padding: 1rem; background: #0f172a; color: #e2e8f0; }
    .test-row { padding: 0.25rem 0; }
    .pass { color: #10b981; }
    .fail { color: #ef4444; }
    .summary { margin-top: 1rem; font-weight: bold; }
  </style>
  <script src="https://unpkg.com/dexie@4.0.8/dist/dexie.min.js"></script>
</head>
<body>
  <h1>Test Results</h1>
  <div id="results"></div>
  <script type="module">
    import { runAll } from './tests/harness.js';
    // Test files will be imported here as they are added.
    runAll(document.getElementById('results'));
  </script>
</body>
</html>
```

- [ ] **Step 3: Verify harness runs**

Open `tests.html` in a browser. Should show "0 passed, 0 failed".

- [ ] **Step 4: Commit**

```bash
git add tests.html tests/harness.js
git commit -m "Test harness: assert helpers and runner page"
```

---

## Task 3: format.js helpers

**Files:**
- Create: `js/format.js`
- Create: `tests/format.test.js`
- Modify: `tests.html` (add import)

- [ ] **Step 1: Write tests at `tests/format.test.js`**

```js
import { describe, it, assertEqual } from './harness.js';
import { rupiah, fmtDate, isSameLocalDay, todayIso } from '../js/format.js';

describe('rupiah', () => {
  it('formats integer rupiah with id-ID locale', () => {
    assertEqual(rupiah(25000), 'Rp 25.000');
    assertEqual(rupiah(0), 'Rp 0');
    assertEqual(rupiah(-5000), '-Rp 5.000');
  });
  it('rounds non-integer input to nearest integer', () => {
    assertEqual(rupiah(99.6), 'Rp 100');
  });
});

describe('fmtDate', () => {
  it('formats ISO into dd/mm/yyyy', () => {
    assertEqual(fmtDate('2026-05-14T08:30:00.000Z'), '14/05/2026');
  });
});

describe('isSameLocalDay', () => {
  it('returns true for same local day', () => {
    const a = new Date(2026, 4, 14, 7, 0).toISOString();
    const b = new Date(2026, 4, 14, 18, 30).toISOString();
    assertEqual(isSameLocalDay(a, b), true);
  });
  it('returns false for different local days', () => {
    const a = new Date(2026, 4, 14, 23, 0).toISOString();
    const b = new Date(2026, 4, 15, 1, 0).toISOString();
    assertEqual(isSameLocalDay(a, b), false);
  });
});

describe('todayIso', () => {
  it('returns an ISO string', () => {
    const v = todayIso();
    assertEqual(typeof v === 'string' && v.endsWith('Z'), true);
  });
});
```

- [ ] **Step 2: Add the import in `tests.html`**

In `tests.html`, before `runAll(...)`, add:

```js
    import './tests/format.test.js';
```

(Inside the same `<script type="module">` block.)

- [ ] **Step 3: Run — expect failures**

Open `tests.html`. All four `format` tests should be red with `format.js` import error.

- [ ] **Step 4: Implement `js/format.js`**

```js
// Manual formatter — Intl currency formatting with IDR injects a non-breaking space
// between "Rp" and the digits, which breaks strict equality with a regular " ".
export function rupiah(n) {
  const v = Math.round(Number(n) || 0);
  const sign = v < 0 ? '-' : '';
  const abs = Math.abs(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sign}Rp ${abs}`;
}

const dateFmt = new Intl.DateTimeFormat('id-ID', {
  day: '2-digit', month: '2-digit', year: 'numeric'
});

export function fmtDate(iso) {
  return dateFmt.format(new Date(iso));
}

export function isSameLocalDay(isoA, isoB) {
  const a = new Date(isoA), b = new Date(isoB);
  return a.getFullYear() === b.getFullYear()
      && a.getMonth() === b.getMonth()
      && a.getDate() === b.getDate();
}

export function todayIso() {
  return new Date().toISOString();
}
```

- [ ] **Step 5: Run — expect all green**

Reload `tests.html`. Four format tests pass.

- [ ] **Step 6: Commit**

```bash
git add js/format.js tests/format.test.js tests.html
git commit -m "format.js: rupiah, fmtDate, isSameLocalDay, todayIso"
```

---

## Task 4: Drivers actions + tests

**Files:**
- Create: `js/actions/drivers.js`
- Create: `tests/drivers.test.js`
- Modify: `tests.html`

Driver shape: `{ id, name, phone, dailyRate, deposit, lowBalanceThresholdLegs, archived, createdAt }`.

- [ ] **Step 1: Write `tests/drivers.test.js`**

```js
import { describe, it, assertEqual, assertRejects } from './harness.js';
import { createDb } from '../js/db.js';
import * as Drivers from '../js/actions/drivers.js';

function freshDb() {
  return createDb('test-drivers-' + crypto.randomUUID());
}

describe('addDriver', () => {
  it('inserts with deposit = initialDeposit and defaults', async () => {
    const db = freshDb();
    try {
      const d = await Drivers.addDriver(db, {
        name: 'Pak Budi', phone: '0812', dailyRate: 25000, initialDeposit: 100000
      });
      assertEqual(d.name, 'Pak Budi');
      assertEqual(d.dailyRate, 25000);
      assertEqual(d.deposit, 100000);
      assertEqual(d.archived, false);
      assertEqual(d.lowBalanceThresholdLegs, 4);
      assertEqual(typeof d.id === 'number', true);
    } finally { await db.delete(); }
  });

  it('creates a matching topup row when initialDeposit > 0', async () => {
    const db = freshDb();
    try {
      const d = await Drivers.addDriver(db, { name: 'X', dailyRate: 1, initialDeposit: 50000 });
      const tops = await db.topups.where({ driverId: d.id }).toArray();
      assertEqual(tops.length, 1);
      assertEqual(tops[0].amount, 50000);
      assertEqual(tops[0].note, 'Initial deposit');
    } finally { await db.delete(); }
  });

  it('rejects non-positive dailyRate', async () => {
    const db = freshDb();
    try {
      await assertRejects(Drivers.addDriver(db, { name: 'X', dailyRate: 0, initialDeposit: 0 }), 'dailyRate');
    } finally { await db.delete(); }
  });
});

describe('updateDriver', () => {
  it('changes name, phone, dailyRate, threshold but not deposit', async () => {
    const db = freshDb();
    try {
      const d = await Drivers.addDriver(db, { name: 'A', dailyRate: 10, initialDeposit: 1000 });
      await Drivers.updateDriver(db, d.id, { name: 'B', dailyRate: 20, lowBalanceThresholdLegs: 7 });
      const got = await db.drivers.get(d.id);
      assertEqual(got.name, 'B');
      assertEqual(got.dailyRate, 20);
      assertEqual(got.lowBalanceThresholdLegs, 7);
      assertEqual(got.deposit, 1000);
    } finally { await db.delete(); }
  });
});

describe('archiveDriver', () => {
  it('sets archived=true; rejects when kids assigned', async () => {
    const db = freshDb();
    try {
      const d = await Drivers.addDriver(db, { name: 'A', dailyRate: 10, initialDeposit: 0 });
      await db.kids.add({ name: 'Kid', driverId: d.id, createdAt: new Date().toISOString() });
      await assertRejects(Drivers.archiveDriver(db, d.id), 'kids');
      await db.kids.clear();
      await Drivers.archiveDriver(db, d.id);
      assertEqual((await db.drivers.get(d.id)).archived, true);
    } finally { await db.delete(); }
  });
});

describe('deleteDriver', () => {
  it('rejects when driver has any history', async () => {
    const db = freshDb();
    try {
      const d = await Drivers.addDriver(db, { name: 'A', dailyRate: 10, initialDeposit: 100 });
      await assertRejects(Drivers.deleteDriver(db, d.id), 'history');
    } finally { await db.delete(); }
  });

  it('deletes driver with no history and no kids', async () => {
    const db = freshDb();
    try {
      const d = await db.drivers.add({
        name: 'A', dailyRate: 10, deposit: 0, archived: false, lowBalanceThresholdLegs: 4,
        createdAt: new Date().toISOString()
      });
      await Drivers.deleteDriver(db, d);
      assertEqual(await db.drivers.get(d), undefined);
    } finally { await db.delete(); }
  });
});

describe('listDrivers', () => {
  it('returns active by default; archived when flag set', async () => {
    const db = freshDb();
    try {
      const a = await Drivers.addDriver(db, { name: 'A', dailyRate: 10, initialDeposit: 0 });
      const b = await Drivers.addDriver(db, { name: 'B', dailyRate: 10, initialDeposit: 0 });
      await db.drivers.update(b.id, { archived: true });
      const active = await Drivers.listDrivers(db);
      assertEqual(active.map(x => x.id), [a.id]);
      const all = await Drivers.listDrivers(db, { includeArchived: true });
      assertEqual(all.length, 2);
    } finally { await db.delete(); }
  });
});
```

- [ ] **Step 2: Add import in `tests.html`**

```js
    import './tests/drivers.test.js';
```

- [ ] **Step 3: Run — expect failures (module not found)**

- [ ] **Step 4: Implement `js/actions/drivers.js`**

```js
export async function addDriver(db, { name, phone = '', dailyRate, initialDeposit = 0, lowBalanceThresholdLegs = 4 }) {
  if (!name) throw new Error('name required');
  if (!(Number(dailyRate) > 0)) throw new Error('dailyRate must be > 0');
  if (Number(initialDeposit) < 0) throw new Error('initialDeposit must be >= 0');
  const now = new Date().toISOString();
  return db.transaction('rw', db.drivers, db.topups, async () => {
    const id = await db.drivers.add({
      name, phone,
      dailyRate: Math.round(dailyRate),
      deposit: Math.round(initialDeposit),
      lowBalanceThresholdLegs,
      archived: false,
      createdAt: now
    });
    if (Number(initialDeposit) > 0) {
      await db.topups.add({
        driverId: id,
        amount: Math.round(initialDeposit),
        note: 'Initial deposit',
        occurredAt: now
      });
    }
    return db.drivers.get(id);
  });
}

export async function updateDriver(db, id, patch) {
  const allowed = ['name', 'phone', 'dailyRate', 'lowBalanceThresholdLegs'];
  const clean = {};
  for (const k of allowed) if (k in patch) clean[k] = patch[k];
  if ('dailyRate' in clean && !(Number(clean.dailyRate) > 0)) throw new Error('dailyRate must be > 0');
  await db.drivers.update(id, clean);
  return db.drivers.get(id);
}

export async function archiveDriver(db, id) {
  const kids = await db.kids.where({ driverId: id }).count();
  if (kids > 0) throw new Error('cannot archive: kids still assigned');
  await db.drivers.update(id, { archived: true });
}

export async function deleteDriver(db, id) {
  const [trips, tops, kids] = await Promise.all([
    db.trips.where({ driverId: id }).count(),
    db.topups.where({ driverId: id }).count(),
    db.kids.where({ driverId: id }).count()
  ]);
  if (trips > 0 || tops > 0) throw new Error('cannot delete: driver has history (archive instead)');
  if (kids > 0) throw new Error('cannot delete: kids still assigned');
  await db.drivers.delete(id);
}

export async function listDrivers(db, { includeArchived = false } = {}) {
  const all = await db.drivers.orderBy('name').toArray();
  return includeArchived ? all : all.filter(d => !d.archived);
}

export async function getDriver(db, id) {
  return db.drivers.get(id);
}
```

- [ ] **Step 5: Run — expect all green**

- [ ] **Step 6: Commit**

```bash
git add js/actions/drivers.js tests/drivers.test.js tests.html
git commit -m "actions/drivers: add, update, archive, delete, list"
```

---

## Task 5: Kids actions + tests

**Files:**
- Create: `js/actions/kids.js`
- Create: `tests/kids.test.js`
- Modify: `tests.html`

- [ ] **Step 1: Write `tests/kids.test.js`**

```js
import { describe, it, assertEqual, assertRejects } from './harness.js';
import { createDb } from '../js/db.js';
import * as Drivers from '../js/actions/drivers.js';
import * as Kids from '../js/actions/kids.js';

function freshDb() { return createDb('test-kids-' + crypto.randomUUID()); }

describe('addKid', () => {
  it('inserts with driverId', async () => {
    const db = freshDb();
    try {
      const d = await Drivers.addDriver(db, { name: 'D', dailyRate: 10, initialDeposit: 0 });
      const k = await Kids.addKid(db, { name: 'Aisha', driverId: d.id });
      assertEqual(k.name, 'Aisha');
      assertEqual(k.driverId, d.id);
    } finally { await db.delete(); }
  });

  it('allows null driverId', async () => {
    const db = freshDb();
    try {
      const k = await Kids.addKid(db, { name: 'X', driverId: null });
      assertEqual(k.driverId, null);
    } finally { await db.delete(); }
  });

  it('rejects unknown driverId', async () => {
    const db = freshDb();
    try {
      await assertRejects(Kids.addKid(db, { name: 'X', driverId: 999 }), 'driver');
    } finally { await db.delete(); }
  });
});

describe('reassignKid', () => {
  it('updates driverId; does not touch past trips', async () => {
    const db = freshDb();
    try {
      const d1 = await Drivers.addDriver(db, { name: 'D1', dailyRate: 10, initialDeposit: 100 });
      const d2 = await Drivers.addDriver(db, { name: 'D2', dailyRate: 10, initialDeposit: 100 });
      const k = await Kids.addKid(db, { name: 'K', driverId: d1.id });
      await db.trips.add({ driverId: d1.id, kidId: k.id, type: 'pickup', amount: 10, occurredAt: new Date().toISOString() });
      await Kids.reassignKid(db, k.id, d2.id);
      assertEqual((await db.kids.get(k.id)).driverId, d2.id);
      const trips = await db.trips.toArray();
      assertEqual(trips[0].driverId, d1.id);
    } finally { await db.delete(); }
  });
});

describe('deleteKid', () => {
  it('rejects when kid has trips', async () => {
    const db = freshDb();
    try {
      const d = await Drivers.addDriver(db, { name: 'D', dailyRate: 10, initialDeposit: 0 });
      const k = await Kids.addKid(db, { name: 'K', driverId: d.id });
      await db.trips.add({ driverId: d.id, kidId: k.id, type: 'pickup', amount: 10, occurredAt: new Date().toISOString() });
      await assertRejects(Kids.deleteKid(db, k.id), 'history');
    } finally { await db.delete(); }
  });

  it('deletes kid with no trips', async () => {
    const db = freshDb();
    try {
      const k = await Kids.addKid(db, { name: 'K', driverId: null });
      await Kids.deleteKid(db, k.id);
      assertEqual(await db.kids.get(k.id), undefined);
    } finally { await db.delete(); }
  });
});

describe('listKids', () => {
  it('returns kids in insertion order', async () => {
    const db = freshDb();
    try {
      await Kids.addKid(db, { name: 'A', driverId: null });
      await Kids.addKid(db, { name: 'B', driverId: null });
      const all = await Kids.listKids(db);
      assertEqual(all.map(x => x.name), ['A', 'B']);
    } finally { await db.delete(); }
  });
});
```

- [ ] **Step 2: Add import in `tests.html`**

```js
    import './tests/kids.test.js';
```

- [ ] **Step 3: Run — expect failures**

- [ ] **Step 4: Implement `js/actions/kids.js`**

```js
export async function addKid(db, { name, driverId = null }) {
  if (!name) throw new Error('name required');
  if (driverId != null) {
    const d = await db.drivers.get(driverId);
    if (!d) throw new Error('unknown driver');
  }
  const id = await db.kids.add({ name, driverId, createdAt: new Date().toISOString() });
  return db.kids.get(id);
}

export async function updateKid(db, id, patch) {
  const allowed = ['name', 'driverId'];
  const clean = {};
  for (const k of allowed) if (k in patch) clean[k] = patch[k];
  if (clean.driverId != null) {
    const d = await db.drivers.get(clean.driverId);
    if (!d) throw new Error('unknown driver');
  }
  await db.kids.update(id, clean);
  return db.kids.get(id);
}

export async function reassignKid(db, kidId, newDriverId) {
  return updateKid(db, kidId, { driverId: newDriverId });
}

export async function deleteKid(db, id) {
  const n = await db.trips.where({ kidId: id }).count();
  if (n > 0) throw new Error('cannot delete: kid has history');
  await db.kids.delete(id);
}

export async function listKids(db) {
  return db.kids.orderBy('createdAt').toArray();
}

export async function getKid(db, id) {
  return db.kids.get(id);
}
```

- [ ] **Step 5: Run — expect all green**

- [ ] **Step 6: Commit**

```bash
git add js/actions/kids.js tests/kids.test.js tests.html
git commit -m "actions/kids: add, update, reassign, delete, list"
```

---

## Task 6: logLeg action with transaction + tests

**Files:**
- Create: `js/actions/log-leg.js`
- Create: `tests/log-leg.test.js`
- Modify: `tests.html`

- [ ] **Step 1: Write `tests/log-leg.test.js`**

```js
import { describe, it, assertEqual, assertRejects } from './harness.js';
import { createDb } from '../js/db.js';
import * as Drivers from '../js/actions/drivers.js';
import * as Kids from '../js/actions/kids.js';
import { logLeg, undoLogLeg } from '../js/actions/log-leg.js';

function freshDb() { return createDb('test-logleg-' + crypto.randomUUID()); }

describe('logLeg', () => {
  it('inserts a trip and decrements deposit atomically', async () => {
    const db = freshDb();
    try {
      const d = await Drivers.addDriver(db, { name: 'D', dailyRate: 25000, initialDeposit: 100000 });
      const k = await Kids.addKid(db, { name: 'K', driverId: d.id });
      const { trip, driver } = await logLeg(db, k.id, 'pickup');
      assertEqual(trip.type, 'pickup');
      assertEqual(trip.amount, 25000);
      assertEqual(trip.driverId, d.id);
      assertEqual(trip.kidId, k.id);
      assertEqual(driver.deposit, 75000);
    } finally { await db.delete(); }
  });

  it('rejects when kid has no driver', async () => {
    const db = freshDb();
    try {
      const k = await Kids.addKid(db, { name: 'K', driverId: null });
      await assertRejects(logLeg(db, k.id, 'pickup'), 'driver');
    } finally { await db.delete(); }
  });

  it('rejects invalid type', async () => {
    const db = freshDb();
    try {
      const d = await Drivers.addDriver(db, { name: 'D', dailyRate: 10, initialDeposit: 100 });
      const k = await Kids.addKid(db, { name: 'K', driverId: d.id });
      await assertRejects(logLeg(db, k.id, 'lunch'), 'type');
    } finally { await db.delete(); }
  });

  it('allows deposit to go negative', async () => {
    const db = freshDb();
    try {
      const d = await Drivers.addDriver(db, { name: 'D', dailyRate: 10000, initialDeposit: 5000 });
      const k = await Kids.addKid(db, { name: 'K', driverId: d.id });
      const { driver } = await logLeg(db, k.id, 'pickup');
      assertEqual(driver.deposit, -5000);
    } finally { await db.delete(); }
  });

  it('snapshots dailyRate so later rate changes do not rewrite history', async () => {
    const db = freshDb();
    try {
      const d = await Drivers.addDriver(db, { name: 'D', dailyRate: 10, initialDeposit: 100 });
      const k = await Kids.addKid(db, { name: 'K', driverId: d.id });
      const { trip } = await logLeg(db, k.id, 'pickup');
      await Drivers.updateDriver(db, d.id, { dailyRate: 999 });
      const got = await db.trips.get(trip.id);
      assertEqual(got.amount, 10);
    } finally { await db.delete(); }
  });
});

describe('undoLogLeg', () => {
  it('removes the trip and restores deposit', async () => {
    const db = freshDb();
    try {
      const d = await Drivers.addDriver(db, { name: 'D', dailyRate: 25000, initialDeposit: 100000 });
      const k = await Kids.addKid(db, { name: 'K', driverId: d.id });
      const { trip } = await logLeg(db, k.id, 'pickup');
      await undoLogLeg(db, trip.id);
      assertEqual(await db.trips.get(trip.id), undefined);
      assertEqual((await db.drivers.get(d.id)).deposit, 100000);
    } finally { await db.delete(); }
  });
});
```

- [ ] **Step 2: Add import in `tests.html`**

```js
    import './tests/log-leg.test.js';
```

- [ ] **Step 3: Run — expect failures**

- [ ] **Step 4: Implement `js/actions/log-leg.js`**

```js
const VALID_TYPES = new Set(['pickup', 'delivery']);

export async function logLeg(db, kidId, type) {
  if (!VALID_TYPES.has(type)) throw new Error('invalid type: ' + type);
  return db.transaction('rw', db.kids, db.drivers, db.trips, async () => {
    const kid = await db.kids.get(kidId);
    if (!kid) throw new Error('unknown kid');
    if (kid.driverId == null) throw new Error('kid has no assigned driver');
    const driver = await db.drivers.get(kid.driverId);
    if (!driver) throw new Error('assigned driver missing');
    const amount = driver.dailyRate;
    const tripId = await db.trips.add({
      driverId: driver.id,
      kidId: kid.id,
      type,
      amount,
      occurredAt: new Date().toISOString()
    });
    await db.drivers.update(driver.id, { deposit: driver.deposit - amount });
    return {
      trip: await db.trips.get(tripId),
      driver: await db.drivers.get(driver.id)
    };
  });
}

export async function undoLogLeg(db, tripId) {
  return db.transaction('rw', db.trips, db.drivers, async () => {
    const trip = await db.trips.get(tripId);
    if (!trip) throw new Error('trip not found');
    const driver = await db.drivers.get(trip.driverId);
    await db.trips.delete(tripId);
    if (driver) await db.drivers.update(driver.id, { deposit: driver.deposit + trip.amount });
  });
}
```

- [ ] **Step 5: Run — expect all green**

- [ ] **Step 6: Commit**

```bash
git add js/actions/log-leg.js tests/log-leg.test.js tests.html
git commit -m "actions/log-leg: atomic leg insert + deposit decrement, undo"
```

---

## Task 7: topUp action + tests

**Files:**
- Create: `js/actions/top-up.js`
- Create: `tests/top-up.test.js`
- Modify: `tests.html`

- [ ] **Step 1: Write `tests/top-up.test.js`**

```js
import { describe, it, assertEqual, assertRejects } from './harness.js';
import { createDb } from '../js/db.js';
import * as Drivers from '../js/actions/drivers.js';
import { topUp, undoTopUp } from '../js/actions/top-up.js';

function freshDb() { return createDb('test-topup-' + crypto.randomUUID()); }

describe('topUp', () => {
  it('inserts topup row and increments deposit atomically', async () => {
    const db = freshDb();
    try {
      const d = await Drivers.addDriver(db, { name: 'D', dailyRate: 10, initialDeposit: 0 });
      const { topup, driver } = await topUp(db, d.id, 500000, 'May payment');
      assertEqual(topup.amount, 500000);
      assertEqual(topup.note, 'May payment');
      assertEqual(driver.deposit, 500000);
    } finally { await db.delete(); }
  });

  it('rejects non-positive amounts', async () => {
    const db = freshDb();
    try {
      const d = await Drivers.addDriver(db, { name: 'D', dailyRate: 10, initialDeposit: 0 });
      await assertRejects(topUp(db, d.id, 0), 'amount');
      await assertRejects(topUp(db, d.id, -5), 'amount');
    } finally { await db.delete(); }
  });

  it('rejects unknown driver', async () => {
    const db = freshDb();
    try {
      await assertRejects(topUp(db, 9999, 100), 'driver');
    } finally { await db.delete(); }
  });
});

describe('undoTopUp', () => {
  it('removes topup row and reverses deposit', async () => {
    const db = freshDb();
    try {
      const d = await Drivers.addDriver(db, { name: 'D', dailyRate: 10, initialDeposit: 0 });
      const { topup } = await topUp(db, d.id, 100000, 'X');
      await undoTopUp(db, topup.id);
      assertEqual(await db.topups.get(topup.id), undefined);
      assertEqual((await db.drivers.get(d.id)).deposit, 0);
    } finally { await db.delete(); }
  });
});
```

- [ ] **Step 2: Add import in `tests.html`**

```js
    import './tests/top-up.test.js';
```

- [ ] **Step 3: Run — expect failures**

- [ ] **Step 4: Implement `js/actions/top-up.js`**

```js
export async function topUp(db, driverId, amount, note = '') {
  if (!(Number(amount) > 0)) throw new Error('amount must be > 0');
  return db.transaction('rw', db.drivers, db.topups, async () => {
    const driver = await db.drivers.get(driverId);
    if (!driver) throw new Error('unknown driver');
    const rounded = Math.round(amount);
    const id = await db.topups.add({
      driverId, amount: rounded, note, occurredAt: new Date().toISOString()
    });
    await db.drivers.update(driverId, { deposit: driver.deposit + rounded });
    return {
      topup: await db.topups.get(id),
      driver: await db.drivers.get(driverId)
    };
  });
}

export async function undoTopUp(db, topupId) {
  return db.transaction('rw', db.topups, db.drivers, async () => {
    const t = await db.topups.get(topupId);
    if (!t) throw new Error('topup not found');
    const driver = await db.drivers.get(t.driverId);
    await db.topups.delete(topupId);
    if (driver) await db.drivers.update(driver.id, { deposit: driver.deposit - t.amount });
  });
}
```

- [ ] **Step 5: Run — expect all green**

- [ ] **Step 6: Commit**

```bash
git add js/actions/top-up.js tests/top-up.test.js tests.html
git commit -m "actions/top-up: atomic topup row + deposit increment, undo"
```

---

## Task 8: History (listHistory + deleteTrip + deleteTopup) + tests

**Files:**
- Create: `js/actions/history.js`
- Create: `tests/history.test.js`
- Modify: `tests.html`

A history row is `{ kind: 'trip'|'topup', id, occurredAt, amount, type?, kidId?, note? }`.

- [ ] **Step 1: Write `tests/history.test.js`**

```js
import { describe, it, assertEqual } from './harness.js';
import { createDb } from '../js/db.js';
import * as Drivers from '../js/actions/drivers.js';
import * as Kids from '../js/actions/kids.js';
import { logLeg } from '../js/actions/log-leg.js';
import { topUp } from '../js/actions/top-up.js';
import { listHistory, deleteTrip, deleteTopup } from '../js/actions/history.js';

function freshDb() { return createDb('test-history-' + crypto.randomUUID()); }

describe('listHistory', () => {
  it('returns trips and topups merged, newest first', async () => {
    const db = freshDb();
    try {
      const d = await Drivers.addDriver(db, { name: 'D', dailyRate: 10, initialDeposit: 0 });
      const k = await Kids.addKid(db, { name: 'K', driverId: d.id });
      const t1 = await topUp(db, d.id, 100, 'a');
      await new Promise(r => setTimeout(r, 5));
      const t2 = await logLeg(db, k.id, 'pickup');
      const rows = await listHistory(db, d.id);
      assertEqual(rows.length, 3); // initial-deposit topup + topUp + trip
      assertEqual(rows[0].kind, 'trip');
      assertEqual(rows[0].id, t2.trip.id);
    } finally { await db.delete(); }
  });
});

describe('deleteTrip', () => {
  it('removes trip and adds amount back to deposit', async () => {
    const db = freshDb();
    try {
      const d = await Drivers.addDriver(db, { name: 'D', dailyRate: 10, initialDeposit: 100 });
      const k = await Kids.addKid(db, { name: 'K', driverId: d.id });
      const { trip } = await logLeg(db, k.id, 'pickup');
      await deleteTrip(db, trip.id);
      assertEqual(await db.trips.get(trip.id), undefined);
      assertEqual((await db.drivers.get(d.id)).deposit, 100);
    } finally { await db.delete(); }
  });
});

describe('deleteTopup', () => {
  it('removes topup and subtracts amount from deposit', async () => {
    const db = freshDb();
    try {
      const d = await Drivers.addDriver(db, { name: 'D', dailyRate: 10, initialDeposit: 0 });
      const { topup } = await topUp(db, d.id, 500, '');
      await deleteTopup(db, topup.id);
      assertEqual(await db.topups.get(topup.id), undefined);
      assertEqual((await db.drivers.get(d.id)).deposit, 0);
    } finally { await db.delete(); }
  });
});
```

- [ ] **Step 2: Add import in `tests.html`**

```js
    import './tests/history.test.js';
```

- [ ] **Step 3: Run — expect failures**

- [ ] **Step 4: Implement `js/actions/history.js`**

```js
import { undoLogLeg } from './log-leg.js';
import { undoTopUp } from './top-up.js';

export async function listHistory(db, driverId) {
  const [trips, tops] = await Promise.all([
    db.trips.where({ driverId }).toArray(),
    db.topups.where({ driverId }).toArray()
  ]);
  const rows = [
    ...trips.map(t => ({
      kind: 'trip', id: t.id, occurredAt: t.occurredAt,
      amount: t.amount, type: t.type, kidId: t.kidId
    })),
    ...tops.map(t => ({
      kind: 'topup', id: t.id, occurredAt: t.occurredAt,
      amount: t.amount, note: t.note
    }))
  ];
  rows.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  return rows;
}

export const deleteTrip = undoLogLeg;
export const deleteTopup = undoTopUp;
```

- [ ] **Step 5: Run — expect all green**

- [ ] **Step 6: Commit**

```bash
git add js/actions/history.js tests/history.test.js tests.html
git commit -m "actions/history: merge trips+topups, delete with reversal"
```

---

## Task 9: Monthly summary + tests

**Files:**
- Create: `js/actions/monthly.js`
- Create: `tests/monthly.test.js`
- Modify: `tests.html`

- [ ] **Step 1: Write `tests/monthly.test.js`**

```js
import { describe, it, assertEqual } from './harness.js';
import { createDb } from '../js/db.js';
import * as Drivers from '../js/actions/drivers.js';
import * as Kids from '../js/actions/kids.js';
import { monthlySummary } from '../js/actions/monthly.js';

function freshDb() { return createDb('test-monthly-' + crypto.randomUUID()); }

async function seedTrip(db, driverId, kidId, type, amount, occurredAt) {
  return db.trips.add({ driverId, kidId, type, amount, occurredAt });
}

describe('monthlySummary', () => {
  it('returns counts, totals, topups, and per-kid breakdown for the month', async () => {
    const db = freshDb();
    try {
      const d = await Drivers.addDriver(db, { name: 'D', dailyRate: 10000, initialDeposit: 0 });
      const a = await Kids.addKid(db, { name: 'A', driverId: d.id });
      const b = await Kids.addKid(db, { name: 'B', driverId: d.id });

      await seedTrip(db, d.id, a.id, 'pickup',   10000, '2026-05-02T01:00:00.000Z');
      await seedTrip(db, d.id, a.id, 'delivery', 10000, '2026-05-02T09:00:00.000Z');
      await seedTrip(db, d.id, b.id, 'pickup',   10000, '2026-05-03T01:00:00.000Z');
      // April trip (out of range)
      await seedTrip(db, d.id, a.id, 'pickup',   10000, '2026-04-29T01:00:00.000Z');
      // May top-up
      await db.topups.add({ driverId: d.id, amount: 200000, note: '', occurredAt: '2026-05-01T00:00:00.000Z' });

      const s = await monthlySummary(db, d.id, 2026, 5);
      assertEqual(s.tripCount, 3);
      assertEqual(s.tripTotal, 30000);
      assertEqual(s.topupTotal, 200000);
      const perKid = Object.fromEntries(s.perKid.map(x => [x.kidId, x]));
      assertEqual(perKid[a.id].count, 2);
      assertEqual(perKid[a.id].total, 20000);
      assertEqual(perKid[b.id].count, 1);
    } finally { await db.delete(); }
  });
});
```

- [ ] **Step 2: Add import in `tests.html`**

```js
    import './tests/monthly.test.js';
```

- [ ] **Step 3: Run — expect failures**

- [ ] **Step 4: Implement `js/actions/monthly.js`**

```js
export async function monthlySummary(db, driverId, year, month) {
  // month: 1..12
  const start = new Date(year, month - 1, 1).toISOString();
  const end = new Date(year, month, 1).toISOString();
  const inRange = r => r.occurredAt >= start && r.occurredAt < end;

  const trips = (await db.trips.where({ driverId }).toArray()).filter(inRange);
  const tops  = (await db.topups.where({ driverId }).toArray()).filter(inRange);

  const perKidMap = new Map();
  for (const t of trips) {
    const cur = perKidMap.get(t.kidId) || { kidId: t.kidId, count: 0, total: 0 };
    cur.count++;
    cur.total += t.amount;
    perKidMap.set(t.kidId, cur);
  }

  return {
    year, month,
    tripCount: trips.length,
    tripTotal: trips.reduce((s, t) => s + t.amount, 0),
    topupCount: tops.length,
    topupTotal: tops.reduce((s, t) => s + t.amount, 0),
    perKid: [...perKidMap.values()]
  };
}
```

- [ ] **Step 5: Run — expect all green**

- [ ] **Step 6: Commit**

```bash
git add js/actions/monthly.js tests/monthly.test.js tests.html
git commit -m "actions/monthly: trip count, totals, per-kid breakdown"
```

---

## Task 10: Boot-time sanity recompute + tests

**Files:**
- Create: `js/actions/sanity.js`
- Create: `tests/sanity.test.js`
- Modify: `tests.html`

- [ ] **Step 1: Write `tests/sanity.test.js`**

```js
import { describe, it, assertEqual } from './harness.js';
import { createDb } from '../js/db.js';
import * as Drivers from '../js/actions/drivers.js';
import { recomputeDeposits } from '../js/actions/sanity.js';

function freshDb() { return createDb('test-sanity-' + crypto.randomUUID()); }

describe('recomputeDeposits', () => {
  it('corrects a drifted deposit', async () => {
    const db = freshDb();
    try {
      const d = await Drivers.addDriver(db, { name: 'D', dailyRate: 10, initialDeposit: 100 });
      // Simulate drift: write a wrong value directly.
      await db.drivers.update(d.id, { deposit: 0 });
      const fixes = await recomputeDeposits(db);
      assertEqual(fixes.length, 1);
      assertEqual((await db.drivers.get(d.id)).deposit, 100);
    } finally { await db.delete(); }
  });

  it('returns empty fix list when deposits are correct', async () => {
    const db = freshDb();
    try {
      await Drivers.addDriver(db, { name: 'D', dailyRate: 10, initialDeposit: 100 });
      const fixes = await recomputeDeposits(db);
      assertEqual(fixes, []);
    } finally { await db.delete(); }
  });
});
```

- [ ] **Step 2: Add import in `tests.html`**

```js
    import './tests/sanity.test.js';
```

- [ ] **Step 3: Run — expect failures**

- [ ] **Step 4: Implement `js/actions/sanity.js`**

```js
export async function recomputeDeposits(db) {
  const drivers = await db.drivers.toArray();
  const fixes = [];
  for (const d of drivers) {
    const [trips, tops] = await Promise.all([
      db.trips.where({ driverId: d.id }).toArray(),
      db.topups.where({ driverId: d.id }).toArray()
    ]);
    const expected = tops.reduce((s, t) => s + t.amount, 0)
                   - trips.reduce((s, t) => s + t.amount, 0);
    if (expected !== d.deposit) {
      await db.drivers.update(d.id, { deposit: expected });
      fixes.push({ driverId: d.id, was: d.deposit, now: expected });
      console.warn('[sanity] fixed deposit for driver', d.id, { was: d.deposit, now: expected });
    }
  }
  return fixes;
}
```

- [ ] **Step 5: Run — expect all green**

- [ ] **Step 6: Commit**

```bash
git add js/actions/sanity.js tests/sanity.test.js tests.html
git commit -m "actions/sanity: recompute and fix drifted deposits"
```

---

## Task 11: Hash router + tests

**Files:**
- Create: `js/router.js`
- Create: `tests/router.test.js`
- Modify: `tests.html`

The router parses `location.hash` into `{ name, params }` and notifies a subscriber on change. Supported routes: `/` → `home`; `/drivers` → `drivers`; `/drivers/:id` → `driverDetail`; `/kids` → `kids`.

- [ ] **Step 1: Write `tests/router.test.js`**

```js
import { describe, it, assertEqual } from './harness.js';
import { parseHash } from '../js/router.js';

describe('parseHash', () => {
  it('empty and / both → home', () => {
    assertEqual(parseHash(''), { name: 'home', params: {} });
    assertEqual(parseHash('#/'), { name: 'home', params: {} });
  });
  it('#/drivers → drivers', () => {
    assertEqual(parseHash('#/drivers'), { name: 'drivers', params: {} });
  });
  it('#/drivers/42 → driverDetail with id 42', () => {
    assertEqual(parseHash('#/drivers/42'), { name: 'driverDetail', params: { id: 42 } });
  });
  it('#/kids → kids', () => {
    assertEqual(parseHash('#/kids'), { name: 'kids', params: {} });
  });
  it('unknown → home', () => {
    assertEqual(parseHash('#/garbage'), { name: 'home', params: {} });
  });
});
```

- [ ] **Step 2: Add import in `tests.html`**

```js
    import './tests/router.test.js';
```

- [ ] **Step 3: Run — expect failures**

- [ ] **Step 4: Implement `js/router.js`**

```js
export function parseHash(hash) {
  const h = (hash || '').replace(/^#/, '');
  if (!h || h === '/') return { name: 'home', params: {} };
  const parts = h.split('/').filter(Boolean);
  if (parts[0] === 'drivers' && parts.length === 1) return { name: 'drivers', params: {} };
  if (parts[0] === 'drivers' && parts.length === 2) return { name: 'driverDetail', params: { id: Number(parts[1]) } };
  if (parts[0] === 'kids') return { name: 'kids', params: {} };
  return { name: 'home', params: {} };
}

export function startRouter(onChange) {
  const fire = () => onChange(parseHash(location.hash));
  window.addEventListener('hashchange', fire);
  fire();
}

export function go(path) {
  location.hash = path.startsWith('#') ? path : '#' + path;
}
```

- [ ] **Step 5: Run — expect all green**

- [ ] **Step 6: Commit**

```bash
git add js/router.js tests/router.test.js tests.html
git commit -m "router: hash parser + listener"
```

---

## Task 12: Alpine store wiring

**Files:**
- Create: `js/store.js`
- Modify: `js/app.js`

The store owns reactive UI state and exposes thin async wrappers calling the action modules. UI uses `$store.app.*` and `$store.toast.*`.

- [ ] **Step 1: Create `js/store.js`**

```js
import { db } from './db.js';
import * as Drivers from './actions/drivers.js';
import * as Kids from './actions/kids.js';
import { logLeg, undoLogLeg } from './actions/log-leg.js';
import { topUp, undoTopUp } from './actions/top-up.js';
import { listHistory, deleteTrip, deleteTopup } from './actions/history.js';
import { monthlySummary } from './actions/monthly.js';
import { recomputeDeposits } from './actions/sanity.js';

export function registerStores(Alpine) {
  Alpine.store('toast', {
    visible: false,
    message: '',
    tone: 'ok',
    _undoFn: null,
    show(message, { tone = 'ok', undo = null, ms = 5000 } = {}) {
      this.message = message;
      this.tone = tone;
      this._undoFn = undo;
      this.visible = true;
      clearTimeout(this._t);
      this._t = setTimeout(() => { this.visible = false; this._undoFn = null; }, ms);
    },
    async runUndo() {
      if (this._undoFn) {
        await this._undoFn();
        this.visible = false;
        this._undoFn = null;
      }
    }
  });

  Alpine.store('app', {
    ready: false,
    route: { name: 'home', params: {} },
    drivers: [],
    kids: [],
    todayLegs: [],         // [{ kidId, type, occurredAt }]
    driverDetail: null,    // { driver, history, monthly, selectedYear, selectedMonth }

    async init() {
      await db.open();
      await recomputeDeposits(db);
      await this.refreshLists();
      this.ready = true;
    },

    async refreshLists() {
      this.drivers = await Drivers.listDrivers(db, { includeArchived: true });
      this.kids = await Kids.listKids(db);
      await this.refreshTodayLegs();
    },

    async refreshTodayLegs() {
      const start = new Date(); start.setHours(0,0,0,0);
      const end = new Date(start); end.setDate(end.getDate() + 1);
      const trips = await db.trips
        .where('occurredAt')
        .between(start.toISOString(), end.toISOString(), true, false)
        .toArray();
      this.todayLegs = trips;
    },

    driverById(id) {
      return this.drivers.find(d => d.id === id);
    },

    activeDrivers() {
      return this.drivers.filter(d => !d.archived);
    },

    legsForKidToday(kidId) {
      return this.todayLegs.filter(t => t.kidId === kidId);
    },

    isLowBalance(driver) {
      return driver.deposit < driver.dailyRate * (driver.lowBalanceThresholdLegs || 4);
    },

    anyLowBalance() {
      return this.activeDrivers().some(d => this.isLowBalance(d));
    },

    routeChanged(route) {
      this.route = route;
      if (route.name === 'driverDetail') this.openDriverDetail(route.params.id);
    },

    async openDriverDetail(id) {
      const driver = await Drivers.getDriver(db, id);
      if (!driver) { this.driverDetail = null; return; }
      const now = new Date();
      const history = await listHistory(db, id);
      const monthly = await monthlySummary(db, id, now.getFullYear(), now.getMonth() + 1);
      this.driverDetail = {
        driver, history, monthly,
        selectedYear: now.getFullYear(), selectedMonth: now.getMonth() + 1
      };
    },

    async setMonth(year, month) {
      const id = this.driverDetail.driver.id;
      const monthly = await monthlySummary(db, id, year, month);
      this.driverDetail.monthly = monthly;
      this.driverDetail.selectedYear = year;
      this.driverDetail.selectedMonth = month;
    },

    // Mutations
    async addDriver(payload) {
      await Drivers.addDriver(db, payload);
      await this.refreshLists();
    },
    async updateDriver(id, patch) {
      await Drivers.updateDriver(db, id, patch);
      await this.refreshLists();
      if (this.driverDetail?.driver.id === id) await this.openDriverDetail(id);
    },
    async archiveDriver(id) {
      await Drivers.archiveDriver(db, id);
      await this.refreshLists();
    },
    async addKid(payload) {
      await Kids.addKid(db, payload);
      await this.refreshLists();
    },
    async updateKid(id, patch) {
      await Kids.updateKid(db, id, patch);
      await this.refreshLists();
    },
    async deleteKid(id) {
      await Kids.deleteKid(db, id);
      await this.refreshLists();
    },

    async logLegFor(kidId, type) {
      const kid = this.kids.find(k => k.id === kidId);
      if (!kid || kid.driverId == null) {
        Alpine.store('toast').show('Assign a driver to this kid first', { tone: 'err' });
        return;
      }
      const { trip, driver } = await logLeg(db, kidId, type);
      await this.refreshLists();
      Alpine.store('toast').show(
        `${type === 'pickup' ? 'Pickup' : 'Delivery'} logged · −${formatIDR(trip.amount)} · ${driver.name}`,
        { tone: driver.deposit < 0 ? 'err' : 'ok',
          undo: async () => { await undoLogLeg(db, trip.id); await this.refreshLists();
            if (this.driverDetail?.driver.id === driver.id) await this.openDriverDetail(driver.id); }
        }
      );
      if (this.driverDetail?.driver.id === driver.id) await this.openDriverDetail(driver.id);
    },

    async topUpDriver(driverId, amount, note) {
      const { topup, driver } = await topUp(db, driverId, amount, note);
      await this.refreshLists();
      Alpine.store('toast').show(
        `+${formatIDR(topup.amount)} added to ${driver.name}`,
        { undo: async () => { await undoTopUp(db, topup.id); await this.refreshLists();
          if (this.driverDetail?.driver.id === driver.id) await this.openDriverDetail(driver.id); } }
      );
      if (this.driverDetail?.driver.id === driverId) await this.openDriverDetail(driverId);
    },

    async deleteTrip(id) {
      await deleteTrip(db, id);
      await this.refreshLists();
      if (this.driverDetail) await this.openDriverDetail(this.driverDetail.driver.id);
    },
    async deleteTopup(id) {
      await deleteTopup(db, id);
      await this.refreshLists();
      if (this.driverDetail) await this.openDriverDetail(this.driverDetail.driver.id);
    }
  });
}

function formatIDR(n) {
  return 'Rp ' + Math.round(n).toLocaleString('id-ID');
}
```

- [ ] **Step 2: Update `js/app.js` to wire stores and router**

```js
import { registerStores } from './store.js';
import { startRouter } from './router.js';

document.addEventListener('alpine:init', () => {
  registerStores(globalThis.Alpine);
});

document.addEventListener('alpine:initialized', async () => {
  const app = globalThis.Alpine.store('app');
  await app.init();
  startRouter(route => app.routeChanged(route));
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW failed', err));
  });
}
```

- [ ] **Step 3: Manual smoke**

Open `index.html`. Console must show no errors. `Alpine.store('app').ready` should be `true` after boot (check via DevTools console: `Alpine.store('app').ready`).

- [ ] **Step 4: Commit**

```bash
git add js/store.js js/app.js
git commit -m "store: Alpine wiring, list refresh, toast with undo"
```

---

## Task 13: Home view (kid cards + log buttons)

**Files:**
- Modify: `index.html` (add the home template)
- Modify: `style.css` (add card and chip styles)

- [ ] **Step 1: Add the Home template inside `<main>` of `index.html`**

Replace the `<div id="view-root"></div>` block with:

```html
<div id="view-root" x-show="$store.app.ready">
  <!-- HOME -->
  <template x-if="$store.app.route.name === 'home'">
    <section>
      <div class="banner banner-warn" x-show="$store.app.anyLowBalance()">
        Low balance on one or more drivers — top up soon.
      </div>
      <template x-if="$store.app.kids.length === 0 || $store.app.activeDrivers().length === 0">
        <div class="empty">
          <p>Welcome. To start, add a driver and a kid.</p>
          <a class="btn" href="#/drivers">Add Driver</a>
          <a class="btn btn-ghost" href="#/kids">Add Kid</a>
        </div>
      </template>
      <template x-for="kid in $store.app.kids" :key="kid.id">
        <article class="kid-card">
          <header>
            <h3 x-text="kid.name"></h3>
            <span class="muted" x-text="$store.app.driverById(kid.driverId)?.name || 'No driver assigned'"></span>
          </header>
          <div class="chips">
            <template x-for="leg in $store.app.legsForKidToday(kid.id)" :key="leg.id">
              <span class="chip" x-text="(leg.type === 'pickup' ? '✓ Pickup ' : '✓ Delivery ') + new Date(leg.occurredAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })"></span>
            </template>
          </div>
          <div class="actions">
            <button class="btn"
                    :disabled="kid.driverId == null"
                    @click="$store.app.logLegFor(kid.id, 'pickup')">Log Pickup</button>
            <button class="btn btn-secondary"
                    :disabled="kid.driverId == null"
                    @click="$store.app.logLegFor(kid.id, 'delivery')">Log Delivery</button>
          </div>
        </article>
      </template>
    </section>
  </template>
</div>
```

- [ ] **Step 2: Add minimal styles in `style.css`** (append)

```css
.banner { padding: 0.75rem 1rem; border-radius: 0.5rem; margin-bottom: 1rem; }
.banner-warn { background: #7c2d12; color: #fed7aa; }
.kid-card { background: #1e293b; border-radius: 0.75rem; padding: 1rem; margin-bottom: 1rem; }
.kid-card header { display: flex; justify-content: space-between; align-items: baseline; }
.kid-card .chips { margin: 0.5rem 0; display: flex; gap: 0.25rem; flex-wrap: wrap; }
.kid-card .chip { background: #0f172a; padding: 0.15rem 0.5rem; border-radius: 999px; font-size: 0.75rem; color: #94a3b8; }
.kid-card .actions { display: flex; gap: 0.5rem; }
.kid-card .actions .btn { flex: 1; }
.btn-secondary { background: #334155; }
.muted { color: #94a3b8; font-size: 0.85rem; }
.empty { text-align: center; padding: 2rem; }
.empty .btn { display: inline-block; margin: 0.25rem; }
.btn-ghost { background: transparent; border: 1px solid #475569; }
[x-cloak] { display: none !important; }
```

- [ ] **Step 3: Manual smoke**

Open `index.html`. With empty DB: empty state visible. In DevTools console run:

```js
await Alpine.store('app').addDriver({ name: 'Pak Budi', dailyRate: 25000, initialDeposit: 100000 });
await Alpine.store('app').addKid({ name: 'Aisha', driverId: Alpine.store('app').drivers[0].id });
```

A kid card with Pickup/Delivery buttons should render. Tap Log Pickup — toast appears, chip appears.

- [ ] **Step 4: Commit**

```bash
git add index.html style.css
git commit -m "home view: kid cards, log buttons, today chips, low-balance banner"
```

---

## Task 14: Drivers list + Add/Edit form

**Files:**
- Modify: `index.html`
- Modify: `style.css`

- [ ] **Step 1: Append templates inside `#view-root`**

```html
<template x-if="$store.app.route.name === 'drivers'">
  <section x-data="{ form: null, editingId: null,
                     blank() { return { name: '', phone: '', dailyRate: 25000, initialDeposit: 0, lowBalanceThresholdLegs: 4 }; } }">
    <h2>Drivers</h2>
    <button class="btn" @click="form = blank(); editingId = null">+ Add Driver</button>

    <template x-for="d in $store.app.drivers" :key="d.id">
      <article class="driver-card" :class="{ archived: d.archived }">
        <header>
          <a :href="'#/drivers/' + d.id"><strong x-text="d.name"></strong></a>
          <span class="muted" x-text="d.archived ? '(archived)' : ''"></span>
        </header>
        <div class="row"><span>Rate</span><span x-text="'Rp ' + d.dailyRate.toLocaleString('id-ID')"></span></div>
        <div class="row" :class="{ low: $store.app.isLowBalance(d) }">
          <span>Deposit</span>
          <span x-text="'Rp ' + d.deposit.toLocaleString('id-ID')"></span>
        </div>
        <div class="actions">
          <button class="btn btn-ghost" @click="form = { name: d.name, phone: d.phone, dailyRate: d.dailyRate, lowBalanceThresholdLegs: d.lowBalanceThresholdLegs }; editingId = d.id">Edit</button>
          <button class="btn btn-ghost" x-show="!d.archived" @click="$store.app.archiveDriver(d.id).catch(e => alert(e.message))">Archive</button>
        </div>
      </article>
    </template>

    <!-- Modal form -->
    <div class="modal-backdrop" x-show="form" x-cloak @click.self="form = null">
      <div class="modal" x-show="form">
        <h3 x-text="editingId ? 'Edit Driver' : 'Add Driver'"></h3>
        <label>Name <input x-model="form.name"></label>
        <label>Phone <input x-model="form.phone"></label>
        <label>Daily rate (Rp) <input type="number" min="1" x-model.number="form.dailyRate"></label>
        <template x-if="!editingId">
          <label>Initial deposit (Rp) <input type="number" min="0" x-model.number="form.initialDeposit"></label>
        </template>
        <label>Low-balance threshold (legs) <input type="number" min="1" x-model.number="form.lowBalanceThresholdLegs"></label>
        <div class="actions">
          <button class="btn" @click="
            (async () => {
              try {
                if (editingId) await $store.app.updateDriver(editingId, form);
                else await $store.app.addDriver(form);
                form = null; editingId = null;
              } catch (e) { alert(e.message); }
            })()">Save</button>
          <button class="btn btn-ghost" @click="form = null">Cancel</button>
        </div>
      </div>
    </div>
  </section>
</template>
```

- [ ] **Step 2: Append styles**

```css
.driver-card { background: #1e293b; border-radius: 0.75rem; padding: 1rem; margin: 0.75rem 0; }
.driver-card.archived { opacity: 0.5; }
.driver-card .row { display: flex; justify-content: space-between; padding: 0.2rem 0; }
.driver-card .row.low { color: #f87171; font-weight: 600; }
.modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { background: #1e293b; padding: 1.25rem; border-radius: 0.75rem; width: min(90vw, 22rem); }
.modal label { display: block; margin: 0.5rem 0; }
.modal input { width: 100%; padding: 0.4rem; background: #0f172a; color: #e2e8f0; border: 1px solid #334155; border-radius: 0.25rem; }
.modal .actions { display: flex; gap: 0.5rem; margin-top: 0.75rem; }
```

- [ ] **Step 3: Manual smoke**

Visit `#/drivers`. Add Driver opens modal. Saving inserts. Editing keeps deposit unchanged. Archive disables on a driver with no kids. Tapping the driver name navigates to `#/drivers/:id` (404-ish placeholder for now).

- [ ] **Step 4: Commit**

```bash
git add index.html style.css
git commit -m "drivers list view + add/edit modal + archive"
```

---

## Task 15: Driver detail — header, top-up, history, monthly

**Files:**
- Modify: `index.html`
- Modify: `style.css`

- [ ] **Step 1: Append the driver detail template**

```html
<template x-if="$store.app.route.name === 'driverDetail'">
  <section x-data="{ tab: 'history', topUpForm: null }">
    <template x-if="$store.app.driverDetail">
      <div>
        <a class="muted" href="#/drivers">← Drivers</a>
        <h2 x-text="$store.app.driverDetail.driver.name"></h2>
        <div class="detail-stats">
          <div>
            <span class="muted">Deposit</span>
            <strong :class="{ low: $store.app.isLowBalance($store.app.driverDetail.driver) }"
                    x-text="'Rp ' + $store.app.driverDetail.driver.deposit.toLocaleString('id-ID')"></strong>
          </div>
          <div><span class="muted">Daily rate</span><strong x-text="'Rp ' + $store.app.driverDetail.driver.dailyRate.toLocaleString('id-ID')"></strong></div>
          <div><span class="muted">Legs remaining</span><strong x-text="Math.floor($store.app.driverDetail.driver.deposit / $store.app.driverDetail.driver.dailyRate)"></strong></div>
        </div>
        <button class="btn" @click="topUpForm = { amount: 0, note: '' }">Top Up</button>

        <nav class="tabs">
          <button :class="{ active: tab === 'history' }" @click="tab = 'history'">History</button>
          <button :class="{ active: tab === 'monthly' }" @click="tab = 'monthly'">Monthly</button>
        </nav>

        <div x-show="tab === 'history'">
          <template x-for="row in $store.app.driverDetail.history" :key="row.kind + ':' + row.id">
            <div class="history-row" :class="row.kind">
              <span class="muted" x-text="new Date(row.occurredAt).toLocaleString('id-ID')"></span>
              <span x-text="row.kind === 'trip' ? row.type : 'top-up'"></span>
              <span x-text="(row.kind === 'trip' ? '−' : '+') + 'Rp ' + row.amount.toLocaleString('id-ID')"></span>
              <button class="btn btn-ghost btn-small" @click="
                (async () => { if (confirm('Delete this entry?')) {
                  if (row.kind === 'trip') await $store.app.deleteTrip(row.id);
                  else await $store.app.deleteTopup(row.id);
                } })()">✕</button>
            </div>
          </template>
        </div>

        <div x-show="tab === 'monthly'">
          <div class="month-picker">
            <button class="btn btn-ghost" @click="
              (async () => { const m = $store.app.driverDetail.selectedMonth - 1;
                if (m < 1) await $store.app.setMonth($store.app.driverDetail.selectedYear - 1, 12);
                else await $store.app.setMonth($store.app.driverDetail.selectedYear, m); })()">←</button>
            <strong x-text="$store.app.driverDetail.selectedYear + '-' + String($store.app.driverDetail.selectedMonth).padStart(2, '0')"></strong>
            <button class="btn btn-ghost" @click="
              (async () => { const m = $store.app.driverDetail.selectedMonth + 1;
                if (m > 12) await $store.app.setMonth($store.app.driverDetail.selectedYear + 1, 1);
                else await $store.app.setMonth($store.app.driverDetail.selectedYear, m); })()">→</button>
          </div>
          <div class="row"><span>Trips</span><strong x-text="$store.app.driverDetail.monthly.tripCount"></strong></div>
          <div class="row"><span>Trip total</span><strong x-text="'Rp ' + $store.app.driverDetail.monthly.tripTotal.toLocaleString('id-ID')"></strong></div>
          <div class="row"><span>Top-ups</span><strong x-text="'Rp ' + $store.app.driverDetail.monthly.topupTotal.toLocaleString('id-ID')"></strong></div>
          <h4>Per kid</h4>
          <template x-for="pk in $store.app.driverDetail.monthly.perKid" :key="pk.kidId">
            <div class="row">
              <span x-text="$store.app.kids.find(k => k.id === pk.kidId)?.name || ('Kid ' + pk.kidId)"></span>
              <span x-text="pk.count + ' legs · Rp ' + pk.total.toLocaleString('id-ID')"></span>
            </div>
          </template>
          <button class="btn" @click="
            (() => {
              const m = $store.app.driverDetail.monthly;
              const d = $store.app.driverDetail.driver;
              const text = `${d.name} — ${m.year}-${String(m.month).padStart(2, '0')}\n`
                + `Trips: ${m.tripCount} (Rp ${m.tripTotal.toLocaleString('id-ID')})\n`
                + `Top-ups: Rp ${m.topupTotal.toLocaleString('id-ID')}`;
              if (navigator.share) navigator.share({ text }).catch(() => {});
              else { navigator.clipboard.writeText(text); alert('Copied to clipboard'); }
            })()">Share</button>
        </div>

        <!-- Top up modal -->
        <div class="modal-backdrop" x-show="topUpForm" x-cloak @click.self="topUpForm = null">
          <div class="modal" x-show="topUpForm">
            <h3>Top up</h3>
            <label>Amount (Rp) <input type="number" min="1" x-model.number="topUpForm.amount"></label>
            <label>Note <input x-model="topUpForm.note"></label>
            <div class="actions">
              <button class="btn" @click="
                (async () => { try {
                  await $store.app.topUpDriver($store.app.driverDetail.driver.id, topUpForm.amount, topUpForm.note);
                  topUpForm = null;
                } catch (e) { alert(e.message); } })()">Save</button>
              <button class="btn btn-ghost" @click="topUpForm = null">Cancel</button>
            </div>
          </div>
        </div>
      </div>
    </template>
    <div x-show="!$store.app.driverDetail">Driver not found.</div>
  </section>
</template>
```

- [ ] **Step 2: Append styles**

```css
.detail-stats { display: flex; gap: 1rem; margin: 1rem 0; }
.detail-stats > div { background: #1e293b; padding: 0.5rem 0.75rem; border-radius: 0.5rem; }
.detail-stats span { display: block; font-size: 0.75rem; }
.detail-stats strong.low { color: #f87171; }
.tabs { display: flex; gap: 0.5rem; margin: 1rem 0; }
.tabs button { background: #1e293b; color: #cbd5e1; padding: 0.5rem 1rem; border: none; border-radius: 0.5rem; }
.tabs button.active { background: #6366f1; color: white; }
.history-row { display: grid; grid-template-columns: 1fr auto auto auto; gap: 0.5rem; padding: 0.4rem 0; border-bottom: 1px solid #1e293b; align-items: center; }
.history-row.trip span:nth-child(3) { color: #f87171; }
.history-row.topup span:nth-child(3) { color: #10b981; }
.btn-small { padding: 0.2rem 0.4rem; font-size: 0.8rem; }
.month-picker { display: flex; align-items: center; gap: 1rem; margin: 0.5rem 0; }
.row { display: flex; justify-content: space-between; padding: 0.25rem 0; }
```

- [ ] **Step 3: Manual smoke**

Add some trips and a top-up, navigate to `#/drivers/<id>`. History shows merged rows newest first. Top Up modal works. Month arrows step ±1 month. Share button copies plain text.

- [ ] **Step 4: Commit**

```bash
git add index.html style.css
git commit -m "driver detail: header, top-up, history with delete, monthly + share"
```

---

## Task 16: Kids list + Add/Edit form

**Files:**
- Modify: `index.html`
- Modify: `style.css`

- [ ] **Step 1: Append kids template**

```html
<template x-if="$store.app.route.name === 'kids'">
  <section x-data="{ form: null, editingId: null }">
    <h2>Kids</h2>
    <button class="btn" @click="form = { name: '', driverId: null }; editingId = null">+ Add Kid</button>
    <template x-for="k in $store.app.kids" :key="k.id">
      <article class="kid-row">
        <strong x-text="k.name"></strong>
        <span class="muted" x-text="$store.app.driverById(k.driverId)?.name || 'No driver'"></span>
        <div class="actions">
          <button class="btn btn-ghost btn-small" @click="form = { name: k.name, driverId: k.driverId }; editingId = k.id">Edit</button>
          <button class="btn btn-ghost btn-small" @click="
            (async () => { if (confirm('Delete ' + k.name + '?')) {
              try { await $store.app.deleteKid(k.id); } catch(e) { alert(e.message); }
            } })()">Delete</button>
        </div>
      </article>
    </template>

    <div class="modal-backdrop" x-show="form" x-cloak @click.self="form = null">
      <div class="modal" x-show="form">
        <h3 x-text="editingId ? 'Edit Kid' : 'Add Kid'"></h3>
        <label>Name <input x-model="form.name"></label>
        <label>Driver
          <select x-model.number="form.driverId">
            <option :value="null">— No driver —</option>
            <template x-for="d in $store.app.activeDrivers()" :key="d.id">
              <option :value="d.id" x-text="d.name"></option>
            </template>
          </select>
        </label>
        <div class="actions">
          <button class="btn" @click="
            (async () => { try {
              if (editingId) await $store.app.updateKid(editingId, form);
              else await $store.app.addKid(form);
              form = null; editingId = null;
            } catch(e) { alert(e.message); } })()">Save</button>
          <button class="btn btn-ghost" @click="form = null">Cancel</button>
        </div>
      </div>
    </div>
  </section>
</template>
```

- [ ] **Step 2: Append styles**

```css
.kid-row { display: grid; grid-template-columns: 1fr 1fr auto; align-items: center; gap: 0.5rem; padding: 0.5rem; border-bottom: 1px solid #1e293b; }
.modal select { width: 100%; padding: 0.4rem; background: #0f172a; color: #e2e8f0; border: 1px solid #334155; border-radius: 0.25rem; }
```

- [ ] **Step 3: Manual smoke**

Visit `#/kids`. Add kid with and without driver. Reassign via Edit. Delete blocked when kid has trips (alert shown).

- [ ] **Step 4: Commit**

```bash
git add index.html style.css
git commit -m "kids list view + add/edit/reassign/delete"
```

---

## Task 17: Toast with undo button

**Files:**
- Modify: `index.html`
- Modify: `style.css`

The toast `<div id="toast-root">` currently only shows the message. Replace it with a button-bearing version.

- [ ] **Step 1: Replace the existing toast `<div>` in `index.html`**

```html
<div id="toast-root" x-data x-show="$store.toast.visible" x-cloak
     :class="'toast toast-' + $store.toast.tone">
  <span x-text="$store.toast.message"></span>
  <button x-show="$store.toast._undoFn" @click="$store.toast.runUndo()">Undo</button>
</div>
```

- [ ] **Step 2: Append styles**

```css
#toast-root.toast { position: fixed; bottom: 4.5rem; left: 1rem; right: 1rem; padding: 0.75rem 1rem; border-radius: 0.5rem; background: #1e293b; color: #e2e8f0; display: flex; justify-content: space-between; align-items: center; gap: 1rem; z-index: 200; }
#toast-root.toast-err { background: #7f1d1d; color: #fee2e2; }
#toast-root button { background: transparent; color: inherit; border: 1px solid currentColor; padding: 0.25rem 0.5rem; border-radius: 0.25rem; }
```

- [ ] **Step 3: Manual smoke**

Log a leg. Toast shows with Undo. Click Undo within 5 s — trip deleted, deposit restored.

- [ ] **Step 4: Commit**

```bash
git add index.html style.css
git commit -m "toast: undo button"
```

---

## Task 18: Tabbar styles + active state

**Files:**
- Modify: `style.css`
- Modify: `js/app.js` (set active-link class on routeChanged)

- [ ] **Step 1: Append tabbar styles**

```css
#tabbar { position: fixed; bottom: 0; left: 0; right: 0; display: flex; background: #0f172a; border-top: 1px solid #1e293b; }
#tabbar a { flex: 1; padding: 0.75rem; text-align: center; text-decoration: none; color: #94a3b8; font-weight: 600; }
#tabbar a.active { color: #818cf8; }
body { padding-bottom: 4rem; }
```

- [ ] **Step 2: Add active-class wiring in `js/app.js`** (append at the bottom)

```js
function paintActiveTab(route) {
  const map = { home: '/', drivers: '/drivers', driverDetail: '/drivers', kids: '/kids' };
  const target = map[route.name] || '/';
  document.querySelectorAll('#tabbar a').forEach(a => {
    a.classList.toggle('active', a.dataset.route === target);
  });
}
document.addEventListener('alpine:initialized', () => {
  const app = globalThis.Alpine.store('app');
  const orig = app.routeChanged.bind(app);
  app.routeChanged = (r) => { orig(r); paintActiveTab(r); };
});
```

- [ ] **Step 3: Manual smoke**

Tabbar is fixed at the bottom and the current route's link is highlighted indigo. Navigation works.

- [ ] **Step 4: Commit**

```bash
git add style.css js/app.js
git commit -m "tabbar: fixed-bottom nav with active state"
```

---

## Task 19: IndexedDB open-failure screen

**Files:**
- Modify: `js/app.js`

- [ ] **Step 1: Add error handler in `js/app.js`**

Replace the existing `alpine:initialized` listener with:

```js
document.addEventListener('alpine:initialized', async () => {
  const app = globalThis.Alpine.store('app');
  try {
    await app.init();
  } catch (err) {
    document.getElementById('view-root').innerHTML =
      `<div class="error-screen">
         <h2>Storage unavailable</h2>
         <p>This app needs IndexedDB. The browser refused with: <code>${err.message}</code>.</p>
         <p>If you're in Private/Incognito mode, try a regular window.</p>
       </div>`;
    return;
  }
  const { startRouter } = await import('./router.js');
  startRouter(route => app.routeChanged(route));
});
```

- [ ] **Step 2: Append style**

```css
.error-screen { padding: 2rem; text-align: center; }
.error-screen code { background: #1e293b; padding: 0 0.3rem; border-radius: 0.2rem; }
```

- [ ] **Step 3: Manual smoke**

Hard to trigger naturally; verify the path by temporarily editing `db.js` to throw on open and reloading — error screen renders. Revert the change before committing.

- [ ] **Step 4: Commit**

```bash
git add js/app.js style.css
git commit -m "boot: friendly error screen when IndexedDB open fails"
```

---

## Task 20: UAT checklist

**Files:**
- Create: `docs/uat.md`

- [ ] **Step 1: Create `docs/uat.md`**

```markdown
# UAT Checklist — GIS Antar Jemput PWA

## First-run
- [ ] Open `index.html` in a fresh profile. Empty state appears with "Add Driver" / "Add Kid" CTAs.

## Drivers
- [ ] Add a driver with name, daily rate Rp 25.000, initial deposit Rp 100.000.
- [ ] Driver shows in `#/drivers` with deposit Rp 100.000.
- [ ] Edit the driver's daily rate to Rp 30.000 — driver shows new rate, deposit unchanged.
- [ ] Try to delete a driver with a topup — it offers Archive instead.

## Kids
- [ ] Add a kid, assign the driver.
- [ ] Reassign the kid to a second driver — old trips stay on the first driver.

## Logging
- [ ] Tap Log Pickup on the kid card — toast `Pickup logged` with Undo. Chip appears on card.
- [ ] Tap Undo before 5 s — chip disappears, deposit restored.
- [ ] Tap Log Pickup then Log Delivery — two chips, deposit decremented twice.

## Top-up
- [ ] From driver detail, tap Top Up, enter Rp 500.000, save. Deposit increases.
- [ ] Undo immediately — deposit reverts.

## Low balance
- [ ] Set a low-balance threshold of 4 legs. Reduce deposit below `rate × 4`. Home banner appears, driver card shows red.
- [ ] Log a leg that pushes deposit negative — toast turns red, deposit shows negative.

## Monthly + share
- [ ] On driver detail → Monthly tab, navigate ←/→ across months. Numbers match recorded data.
- [ ] Tap Share — `navigator.share` opens, or text is copied to clipboard with alert confirmation.

## PWA / offline
- [ ] In DevTools Application → Service Workers, confirm `sw.js` is activated, `gis-pwa-v2`.
- [ ] DevTools → Network → Offline, reload the page — app still loads from cache.
- [ ] Add a driver while offline — data persists. Reopen browser — driver still there.

## Schema migration (manual)
- [ ] After a future `db.version(2)` change, reopen the app and confirm no migration error in Console.

## Tests
- [ ] Open `tests.html` — all tests pass.
```

- [ ] **Step 2: Commit**

```bash
git add docs/uat.md
git commit -m "docs/uat: manual checklist"
```

---

## Task 21: Final smoke + cache bump

**Files:**
- Modify: `sw.js` (bump CACHE_NAME if any JS changed since Task 1)

- [ ] **Step 1: If any `js/*.js` was touched after the last `CACHE_NAME` bump, bump it again**

```js
const CACHE_NAME = 'gis-pwa-v3';
```

- [ ] **Step 2: Run `tests.html` — every group green**

- [ ] **Step 3: Walk through `docs/uat.md` end-to-end on a real device or Chrome DevTools mobile emulation**

- [ ] **Step 4: Commit any final tweaks**

```bash
git add -A
git commit -m "Cache version bump for final release of v1"
```

---

## Spec coverage check

- Driver registration with form, deposit, daily rate, threshold → Task 4 + Task 14.
- Per-leg charging with rate snapshot → Task 6 (`logLeg`) tested.
- Local IndexedDB storage → Task 1, db.js.
- Multiple drivers / multiple kids / kid assigned to one driver → Tasks 5, 16.
- One-tap log buttons → Task 13.
- Trip history per driver → Task 8, Task 15.
- Low-balance warning → Task 13 banner, Task 14 card row, Task 15 strong indicator.
- Monthly summary + share → Task 9, Task 15.
- Top-up log → Task 7, Task 15 history.
- Boot sanity recompute → Task 10, store init.
- Service worker offline + skipWaiting/claim → Task 1.
- Negative deposit allowed + flagged → Task 6 test, Task 13 toast tone.
- Delete trip / top-up reverses deposit → Task 8.
- Archive vs delete driver → Task 4 tests, Task 14 UI.
- Reassign kid doesn't rewrite history → Task 5 test.
- Storage-failure screen → Task 19.
- UAT checklist → Task 20.

No gaps.
