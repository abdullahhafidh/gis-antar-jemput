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
