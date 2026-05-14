const VALID_TYPES = new Set(['pickup', 'delivery']);

export async function logLeg(db, kidId, type) {
  const kId = Number(kidId);
  if (!VALID_TYPES.has(type)) throw new Error('invalid type: ' + type);
  return db.transaction('rw', db.kids, db.drivers, db.trips, async () => {
    const kid = await db.kids.get(kId);
    if (!kid) throw new Error('unknown kid');
    const dId = Number(kid.driverId);
    if (isNaN(dId)) throw new Error('kid has no assigned driver');
    const driver = await db.drivers.get(dId);
    if (!driver) throw new Error('assigned driver missing');
    const amount = Number(driver.dailyRate) || 0;
    const tripId = await db.trips.add({
      driverId: dId,
      kidId: kId,
      type,
      amount,
      occurredAt: new Date().toISOString()
    });
    const currentDeposit = Number(driver.deposit) || 0;
    const newDeposit = currentDeposit - amount;
    console.log('[logLeg] updating driver', { dId, was: currentDeposit, now: newDeposit });
    await db.drivers.update(dId, { deposit: newDeposit });
    const verify = await db.drivers.get(dId);
    console.log('[logLeg] verify deposit in DB:', verify.deposit);
    return {
      trip: await db.trips.get(tripId),
      driver: verify
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
