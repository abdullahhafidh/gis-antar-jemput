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
