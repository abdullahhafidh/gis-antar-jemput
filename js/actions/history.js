import { undoLogLeg } from './log-leg.js';
import { undoTopUp } from './top-up.js';

export async function listHistory(db, driverId) {
  console.log('[listHistory] starting. DB:', db.name, 'Open:', db.isOpen());
  const dId = Number(driverId);
  const allTops = await db.topups.toArray();
  const allTrips = await db.trips.toArray();
  console.log('[listHistory] ALL topups in DB:', allTops);
  console.log('[listHistory] Searching for dId:', dId);

  const trips = allTrips.filter(t => Number(t.driverId) === dId);
  const tops = allTops.filter(t => Number(t.driverId) === dId);
  console.log('[listHistory] Found matches:', { trips: trips.length, tops: tops.length });
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
