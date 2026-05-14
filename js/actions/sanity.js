export async function recomputeDeposits(db) {
  const drivers = await db.drivers.toArray();
  const fixes = [];
  for (const d of drivers) {
    const dId = Number(d.id);
    const [trips, tops] = await Promise.all([
      db.trips.where('driverId').equals(dId).toArray(),
      db.topups.where('driverId').equals(dId).toArray()
    ]);
    console.log(`[sanity] driver ${dId} has ${trips.length} trips and ${tops.length} topups`);
    const expected = tops.reduce((s, t) => s + (Number(t.amount) || 0), 0)
                   - trips.reduce((s, t) => s + (Number(t.amount) || 0), 0);
    if (expected !== d.deposit) {
      console.warn(`[sanity] Fixing deposit for driver ${dId} (${d.name}): ${d.deposit} -> ${expected}`);
      await db.drivers.update(dId, { deposit: expected });
      fixes.push({ driverId: dId, was: d.deposit, now: expected });
    }
  }
  return fixes;
}
