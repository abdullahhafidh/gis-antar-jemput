export async function topUp(db, driverId, amount, note = '') {
  const dId = Number(driverId);
  if (Number(amount) === 0) throw new Error('amount cannot be zero');
  return db.transaction('rw', ['drivers', 'topups'], async () => {
    const driver = await db.table('drivers').get(dId);
    if (!driver) throw new Error('unknown driver');
    const rounded = Math.round(Number(amount) || 0);
    const id = await db.table('topups').add({
      driverId: dId, amount: rounded, note, occurredAt: new Date().toISOString()
    });
    const currentDeposit = Number(driver.deposit) || 0;
    const newDeposit = currentDeposit + rounded;
    await db.table('drivers').update(dId, { deposit: newDeposit });
    return {
      topup: await db.table('topups').get(id),
      driver: await db.table('drivers').get(dId)
    };
  });
}

export async function undoTopUp(db, topupId) {
  console.warn('[undoTopUp] CALLED for id:', topupId);
  console.trace();
  return db.transaction('rw', ['topups', 'drivers'], async () => {
    const t = await db.table('topups').get(topupId);
    if (!t) return;
    const driver = await db.table('drivers').get(t.driverId);
    if (driver) {
      await db.table('drivers').update(driver.id, {
        deposit: (Number(driver.deposit) || 0) - (Number(t.amount) || 0)
      });
    }
    await db.table('topups').delete(topupId);
  });
}
