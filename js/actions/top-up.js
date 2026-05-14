export async function topUp(db, driverId, amount, note = '') {
  console.log('[topUp] starting with DB:', db.name, 'v' + db.verno);
  const dId = Number(driverId);
  const before = await db.table('topups').count();
  console.log('[topUp] count before:', before);
  if (!(Number(amount) > 0)) throw new Error('amount must be > 0');
  const tx = await db.transaction('rw', ['drivers', 'topups'], async () => {
    const driver = await db.table('drivers').get(dId);
    if (!driver) throw new Error('unknown driver');
    const rounded = Math.round(Number(amount) || 0);
    console.log('[topUp] transaction start', { dId, amount, rounded });
    const id = await db.table('topups').add({
      driverId: dId, amount: rounded, note, occurredAt: new Date().toISOString()
    });
    const immediateCheck = await db.table('topups').where('driverId').equals(dId).toArray();
    console.log('[topUp] check query after add:', { dId, count: immediateCheck.length });
    const currentDeposit = Number(driver.deposit) || 0;
    const newDeposit = currentDeposit + rounded;
    console.log('[topUp] updating driver', { dId, was: currentDeposit, add: rounded, now: newDeposit });
    await db.table('drivers').update(dId, { deposit: newDeposit });
    const verifyTopup = await db.table('topups').get(id);
    console.log('[topUp] verify topup record in DB:', verifyTopup);
    const verify = await db.table('drivers').get(dId);
    console.log('[topUp] verify driver deposit in DB:', verify.deposit);
    return {
      topup: verifyTopup,
      driver: verify
    };
  });
  console.log('[topUp] transaction COMPLETED/COMMITTED. Open:', db.isOpen());
  return tx;
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
