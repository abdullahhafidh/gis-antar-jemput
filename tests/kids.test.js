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
