export async function addDriver(db, { name, phone = '', dailyRate, initialDeposit = 0, lowBalanceThresholdLegs = 4 }) {
  if (!name) throw new Error('name required');
  if (!(Number(dailyRate) > 0)) throw new Error('dailyRate must be > 0');
  if (Number(initialDeposit) < 0) throw new Error('initialDeposit must be >= 0');
  const now = new Date().toISOString();
  return db.transaction('rw', db.drivers, db.topups, async () => {
    const id = await db.drivers.add({
      name, phone,
      dailyRate: Math.round(dailyRate),
      deposit: Math.round(initialDeposit),
      lowBalanceThresholdLegs,
      archived: false,
      createdAt: now
    });
    if (Number(initialDeposit) > 0) {
      await db.topups.add({
        driverId: id,
        amount: Math.round(initialDeposit),
        note: 'Initial deposit',
        occurredAt: now
      });
    }
    return db.drivers.get(id);
  });
}

export async function updateDriver(db, id, patch) {
  const allowed = ['name', 'phone', 'dailyRate', 'lowBalanceThresholdLegs'];
  const clean = {};
  for (const k of allowed) if (k in patch) clean[k] = patch[k];
  if ('dailyRate' in clean) {
    if (!(Number(clean.dailyRate) > 0)) throw new Error('dailyRate must be > 0');
    clean.dailyRate = Math.round(clean.dailyRate);
  }
  await db.drivers.update(id, clean);
  return db.drivers.get(id);
}

export async function archiveDriver(db, id) {
  const kids = await db.kids.where({ driverId: id }).count();
  if (kids > 0) throw new Error('cannot archive: kids still assigned');
  await db.drivers.update(id, { archived: true });
}

export async function deleteDriver(db, id) {
  const [trips, tops, kids] = await Promise.all([
    db.trips.where({ driverId: id }).count(),
    db.topups.where({ driverId: id }).count(),
    db.kids.where({ driverId: id }).count()
  ]);
  if (trips > 0 || tops > 0) throw new Error('cannot delete: driver has history (archive instead)');
  if (kids > 0) throw new Error('cannot delete: kids still assigned');
  await db.drivers.delete(id);
}

export async function listDrivers(db, { includeArchived = false } = {}) {
  const all = await db.drivers.orderBy('name').toArray();
  return includeArchived ? all : all.filter(d => !d.archived);
}

export async function getDriver(db, id) {
  return db.drivers.get(id);
}
