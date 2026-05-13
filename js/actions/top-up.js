export async function topUp(db, driverId, amount, note = '') {
  if (!(Number(amount) > 0)) throw new Error('amount must be > 0');
  return db.transaction('rw', db.drivers, db.topups, async () => {
    const driver = await db.drivers.get(driverId);
    if (!driver) throw new Error('unknown driver');
    const rounded = Math.round(amount);
    const id = await db.topups.add({
      driverId, amount: rounded, note, occurredAt: new Date().toISOString()
    });
    await db.drivers.update(driverId, { deposit: driver.deposit + rounded });
    return {
      topup: await db.topups.get(id),
      driver: await db.drivers.get(driverId)
    };
  });
}

export async function undoTopUp(db, topupId) {
  return db.transaction('rw', db.topups, db.drivers, async () => {
    const t = await db.topups.get(topupId);
    if (!t) throw new Error('topup not found');
    const driver = await db.drivers.get(t.driverId);
    await db.topups.delete(topupId);
    if (driver) await db.drivers.update(driver.id, { deposit: driver.deposit - t.amount });
  });
}
