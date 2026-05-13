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
