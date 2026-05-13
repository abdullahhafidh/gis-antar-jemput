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
