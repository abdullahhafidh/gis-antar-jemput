export async function topUp(db, driverId, amount, note = '') {
  const dId = Number(driverId);
  if (!(Number(amount) > 0)) throw new Error('amount must be > 0');
  return db.transaction('rw', db.drivers, db.topups, async () => {
    const driver = await db.drivers.get(dId);
    if (!driver) throw new Error('unknown driver');
    const rounded = Math.round(Number(amount) || 0);
    console.log('[topUp] transaction start', { dId, amount, rounded });
    const id = await db.topups.add({
      driverId: dId, amount: rounded, note, occurredAt: new Date().toISOString()
    });
    const currentDeposit = Number(driver.deposit) || 0;
    console.log('[topUp] updating driver', { dId, was: currentDeposit, add: rounded });
    await db.drivers.update(dId, { deposit: currentDeposit + rounded });
    return {
      topup: await db.topups.get(id),
      driver: await db.drivers.get(dId)
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
