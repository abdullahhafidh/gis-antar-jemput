const VALID_TYPES = new Set(['pickup', 'delivery']);

export async function logLeg(db, kidId, type) {
  if (!VALID_TYPES.has(type)) throw new Error('invalid type: ' + type);
  return db.transaction('rw', db.kids, db.drivers, db.trips, async () => {
    const kid = await db.kids.get(kidId);
    if (!kid) throw new Error('unknown kid');
    if (kid.driverId == null) throw new Error('kid has no assigned driver');
    const driver = await db.drivers.get(kid.driverId);
    if (!driver) throw new Error('assigned driver missing');
    const amount = driver.dailyRate;
    const tripId = await db.trips.add({
      driverId: driver.id,
      kidId: kid.id,
      type,
      amount,
      occurredAt: new Date().toISOString()
    });
    await db.drivers.update(driver.id, { deposit: driver.deposit - amount });
    return {
      trip: await db.trips.get(tripId),
      driver: await db.drivers.get(driver.id)
    };
  });
}

export async function undoLogLeg(db, tripId) {
  return db.transaction('rw', db.trips, db.drivers, async () => {
    const trip = await db.trips.get(tripId);
    if (!trip) throw new Error('trip not found');
    const driver = await db.drivers.get(trip.driverId);
    await db.trips.delete(tripId);
    if (driver) await db.drivers.update(driver.id, { deposit: driver.deposit + trip.amount });
  });
}
