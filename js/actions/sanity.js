export async function recomputeDeposits(db) {
  const drivers = await db.drivers.toArray();
  const allTops = await db.topups.toArray();
  console.log('[sanity] ALL topups in DB:', allTops);
  const fixes = [];
  for (const d of drivers) {
    const dId = Number(d.id);
    const trips = (await db.trips.toArray()).filter(t => Number(t.driverId) === dId);
    const tops = (await db.topups.toArray()).filter(t => Number(t.driverId) === dId);
    console.log(`[sanity] driver ${dId} has ${trips.length} trips and ${tops.length} topups`);
    const expected = tops.reduce((s, t) => s + (Number(t.amount) || 0), 0)
                   - trips.reduce((s, t) => s + (Number(t.amount) || 0), 0);
    if (expected !== d.deposit) {
      console.warn(`[sanity] WOULD fix deposit for driver ${dId} (${d.name}): ${d.deposit} -> ${expected} (BUT SKIPPED)`);
      // await db.drivers.update(dId, { deposit: expected });
      fixes.push({ driverId: dId, was: d.deposit, now: expected });
    }
  }
  return fixes;
}
