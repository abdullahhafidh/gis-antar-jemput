export async function recomputeDeposits(db) {
  const drivers = await db.drivers.toArray();
  const fixes = [];
  for (const d of drivers) {
    const dId = Number(d.id);
    const [trips, tops] = await Promise.all([
      db.trips.where('driverId').equals(dId).toArray(),
      db.topups.where('driverId').equals(dId).toArray()
    ]);
    const expected = tops.reduce((s, t) => s + (Number(t.amount) || 0), 0)
                   - trips.reduce((s, t) => s + (Number(t.amount) || 0), 0);
    if (expected !== d.deposit) {
      await db.drivers.update(d.id, { deposit: expected });
      fixes.push({ driverId: d.id, was: d.deposit, now: expected });
      console.warn('[sanity] fixed deposit for driver', d.id, { was: d.deposit, now: expected });
    }
  }
  return fixes;
}
