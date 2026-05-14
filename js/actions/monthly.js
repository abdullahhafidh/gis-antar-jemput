export async function monthlySummary(db, driverId, year, month) {
  // month: 1..12
  const start = new Date(year, month - 1, 1).toISOString();
  const end = new Date(year, month, 1).toISOString();
  const dId = Number(driverId);
  const inRange = r => r.occurredAt >= start && r.occurredAt < end;

  const trips = (await db.trips.where('driverId').equals(dId).toArray()).filter(inRange);
  const tops  = (await db.topups.where('driverId').equals(dId).toArray()).filter(inRange);

  const perKidMap = new Map();
  for (const t of trips) {
    const cur = perKidMap.get(t.kidId) || { kidId: t.kidId, count: 0, total: 0 };
    cur.count++;
    cur.total += t.amount;
    perKidMap.set(t.kidId, cur);
  }

  return {
    year, month,
    tripCount: trips.length,
    tripTotal: trips.reduce((s, t) => s + t.amount, 0),
    topupCount: tops.length,
    topupTotal: tops.reduce((s, t) => s + t.amount, 0),
    perKid: [...perKidMap.values()]
  };
}
