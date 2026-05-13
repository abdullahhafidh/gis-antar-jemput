# GIS Antar Jemput — School-Trip Tracker PWA

**Date:** 2026-05-14
**Status:** Design

## Purpose

A personal Progressive Web App for the project owner to track school pickup/delivery trips for their kid(s) by paid drivers. The app records each leg (pickup or delivery), debits a per-driver deposit at the driver's daily rate, and lets the owner top up deposits. Drivers and kids are added manually through forms in the app.

The app must work fully offline after first load and store all data locally on the device.

## Constraints

- Extend the existing zero-build PWA scaffold (`index.html`, `style.css`, `sw.js`, `manifest.json`, `icon.png`). No build step, no npm.
- All data lives in the browser (IndexedDB). No backend.
- Locale: Indonesia. Currency formatted as IDR, dates in `id-ID` locale, timezone Asia/Jakarta.

## Tech stack

- Existing PWA scaffold (vanilla HTML/CSS, service worker, manifest)
- **Alpine.js 3** (via CDN, `defer`) for reactive view bindings
- **Dexie.js 4** (via CDN) as the IndexedDB wrapper
- No bundler, no transpiler, no test framework

All CDN URLs added to the service worker's `ASSETS` cache list so they are available offline.

## File layout

```
gis-antar-jemput/
  index.html          # app shell + Alpine x-templates for every view
  style.css           # existing styles, extended
  sw.js               # ASSETS list extended to include js/* and CDN URLs
  manifest.json       # unchanged
  icon.png            # unchanged
  js/
    db.js             # Dexie schema + DB instance
    store.js          # Alpine store: state + actions (CRUD, logLeg, topUp, recompute)
    format.js         # IDR currency, dd/mm/yyyy date helpers
    router.js         # hash router: #/, #/drivers, #/drivers/:id, #/kids
    app.js            # boot: register SW, init store, mount router
  tests.html          # in-browser logic test runner (manual)
  docs/
    uat.md            # manual UAT checklist
```

## Data model (Dexie / IndexedDB)

Four tables. Money stored as integer rupiah. Dates as ISO 8601 strings.

```js
db.version(1).stores({
  drivers:  '++id, name, createdAt',
  kids:     '++id, name, driverId, createdAt',
  trips:    '++id, driverId, kidId, type, occurredAt',
  topups:   '++id, driverId, occurredAt'
});
```

### driver

`{ id, name, phone?, dailyRate, deposit, lowBalanceThresholdLegs, archived, createdAt }`

- `dailyRate` — integer rupiah charged per leg (one pickup OR one delivery).
- `deposit` — denormalized current balance. Recomputable from `topups − trips`.
- `lowBalanceThresholdLegs` — integer N, default 4. Used to color the deposit indicator.
- `archived` — boolean, hides driver from active lists but preserves historical data.

### kid

`{ id, name, driverId, createdAt }`

- `driverId` is the currently-assigned driver. Reassigning updates this field only and does not touch past trips.

### trip

`{ id, driverId, kidId, type, amount, occurredAt, note? }`

- `type` ∈ `'pickup' | 'delivery'`.
- `amount` snapshots the driver's `dailyRate` at the moment of logging — rate changes do not rewrite history.
- `driverId` is also snapshotted, so reassigning a kid does not relabel old trips.

### topup

`{ id, driverId, amount, note?, occurredAt }`

- Append-only log of deposit additions. Deleting a top-up reduces the driver's `deposit`.

### Invariant

For every driver:

```
driver.deposit === sum(topups.amount where driverId) − sum(trips.amount where driverId)
```

The store recomputes after every mutation and on app boot so the denormalized value cannot drift.

## Screens

Hash router with four routes.

### `#/` — Home (Today)

- One card per active kid. Card shows kid name, assigned driver name, and two large buttons: `Log Pickup` and `Log Delivery`.
- Today's already-logged legs appear as small chips on the card (`✓ Pickup 07:12`) to prevent double-tapping.
- A low-balance banner appears at the top whenever any active driver's deposit falls below `dailyRate × lowBalanceThresholdLegs`.
- Empty-state guidance when no drivers or no kids exist yet, with CTAs to add them.

### `#/drivers` — Drivers

- List of active driver cards. Each card shows: name, daily rate, current deposit, and a color indicator (green / amber / red) based on remaining legs vs `lowBalanceThresholdLegs`.
- `+ Add Driver` button opens a form (name, optional phone, daily rate, initial deposit, optional `lowBalanceThresholdLegs`).
- Tapping a card opens driver detail.
- Toggle to show archived drivers.

### `#/drivers/:id` — Driver detail

- Header: name, current deposit (large), daily rate, "legs remaining" estimate (`floor(deposit / dailyRate)`).
- `Top Up` button opens a modal (amount, optional note). Submitting appends to `topups` and bumps `deposit`.
- Tabs:
  - **History** — reverse-chronological list mixing trips and top-ups. Each row shows date, type, kid (for trips), amount. Swipe-to-delete supported.
  - **Monthly** — month picker; for the selected month shows trip count, total spent, top-ups, and a per-kid breakdown. A `Share` button uses the Web Share API (or falls back to clipboard) to share a plain-text summary.
- Edit driver fields. Delete is blocked if the driver has any history or assigned kids; offers `Archive` instead.

### `#/kids` — Kids

- List of kids with their assigned driver.
- Add/Edit form: name + driver picker.
- Reassigning a kid only updates `kid.driverId`. Past trips stay attached to the previous driver via their snapshotted `driverId`.

## Core flows

### Log a leg (one-tap)

1. User taps `Log Pickup` (or `Log Delivery`) on a kid card.
2. Store action `logLeg(kidId, type)`:
   - Load kid; resolve `driverId` and driver's current `dailyRate`.
   - In a single Dexie `rw` transaction over `drivers` and `trips`:
     - Insert `trip { driverId, kidId, type, amount: dailyRate, occurredAt: now }`.
     - Decrement `driver.deposit` by `dailyRate`.
3. Optimistic UI update; toast `Pickup logged · −Rp 25.000 · Driver: Pak Budi` with 5-second `Undo`. Undo deletes the trip and restores the deposit in one transaction.
4. If kid has no assigned driver, block the tap with a toast `Assign a driver first` plus a deep link to the kid edit form.
5. The log is allowed even if it pushes `deposit` negative. The toast turns red and the low-balance banner appears.

### Top up a driver

1. From driver detail, tap `Top Up`. Modal asks for amount (required) and note (optional).
2. Store action `topUp(driverId, amount, note)` in one transaction:
   - Insert `topup { driverId, amount, note, occurredAt: now }`.
   - Increment `driver.deposit` by `amount`.
3. Toast `+Rp 500.000 added to Pak Budi` with 5-second `Undo`.

### Reassign a kid

1. Edit kid → change driver dropdown → save.
2. Store action `reassignKid(kidId, newDriverId)` updates `kid.driverId` only. Past trips remain attached to the previous driver.

### Boot-time sanity check

On app load, for each driver compute `expectedDeposit = sum(topups) − sum(trips)`. If it differs from the stored `deposit`, overwrite the stored value and `console.warn` once. This catches drift from a transaction that was interrupted by the tab closing mid-write.

## Error handling and edge cases

- **First-run.** No drivers + no kids → guided empty state. Log buttons are hidden until at least one kid exists with an assigned driver.
- **Delete driver.** Forbidden if the driver has any trips, top-ups, or assigned kids. Offered as `Archive` instead, which sets `archived = true`.
- **Delete trip / top-up.** Allowed from History via swipe. Single transaction: delete the row and reverse the deposit change.
- **Edit driver's daily rate.** Affects only future trips; existing trips retain their snapshotted `amount`.
- **Negative deposit.** Allowed. Indicates owed amount; surfaced via red color and home banner.
- **Date handling.** `occurredAt = new Date().toISOString()`. All display uses `Intl.DateTimeFormat('id-ID', { … })` and local-day boundaries (not UTC) for "today's logs" filtering.
- **Money handling.** Integer rupiah throughout. Display via `Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' })`.
- **IndexedDB unavailable.** If `db.open()` fails (private mode, quota exceeded), show a full-screen error with the cause. No silent fallback to localStorage — that would let data drift.
- **Service worker upgrades.** Bump `CACHE_NAME` (`gis-pwa-v2`, …) for every JS change. SW calls `skipWaiting()` on install and `clients.claim()` on activate so updates apply on next launch without a hard reload.
- **Schema migrations.** Future schema changes use Dexie `db.version(N).stores(...).upgrade(tx => …)`.

## Testing

- **Logic tests in `tests.html`** — vanilla in-browser runner with a tiny `assert(name, fn)` harness. Covers:
  - `store.js` actions: `logLeg`, `topUp`, `reassignKid`, delete trip / top-up, boot-time sanity recompute.
  - `format.js` helpers.
  - Dexie transaction rollback: force an error mid-`logLeg` and assert deposit is unchanged.
- **Isolated DB per test.** Each test creates a fresh `new Dexie('test-' + Date.now())` instance.
- **Manual UAT checklist in `docs/uat.md`.** Install as PWA, log trips offline, kill SW and reload to confirm cached assets, exercise schema bump path.
- **No UI automation.** Alpine + four screens does not warrant Playwright/Cypress setup.

## Out of scope (v1)

- Cloud sync, multi-device sync, accounts.
- Manual import/export of data (declined during brainstorming; revisit if first user run shows data-loss risk).
- Push notifications, geolocation, maps.
- Driver-side app or any role other than the project owner.

## Open questions

None at design time. Future revisions may revisit:

- Whether to add JSON export/import as a v1.1 backup safety net.
- Whether per-kid daily rates are needed once usage is real.
