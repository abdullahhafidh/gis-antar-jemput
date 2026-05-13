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
      assertEqual(rows.length, 2);
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
