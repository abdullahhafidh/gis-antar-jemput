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
