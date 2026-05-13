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
