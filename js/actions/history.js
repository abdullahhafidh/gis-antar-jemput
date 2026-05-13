import { undoLogLeg } from './log-leg.js';
import { undoTopUp } from './top-up.js';

export async function listHistory(db, driverId) {
  const [trips, tops] = await Promise.all([
    db.trips.where({ driverId }).toArray(),
    db.topups.where({ driverId }).toArray()
  ]);
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
