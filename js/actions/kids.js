export async function addKid(db, { name, driverId = null }) {
  if (!name) throw new Error('name required');
  if (driverId != null) {
    const d = await db.drivers.get(driverId);
    if (!d) throw new Error('unknown driver');
  }
  const id = await db.kids.add({ name, driverId, createdAt: new Date().toISOString() });
  return db.kids.get(id);
}

export async function updateKid(db, id, patch) {
  const allowed = ['name', 'driverId'];
  const clean = {};
  for (const k of allowed) if (k in patch) clean[k] = patch[k];
  if (clean.driverId != null) {
    const d = await db.drivers.get(clean.driverId);
    if (!d) throw new Error('unknown driver');
  }
  await db.kids.update(id, clean);
  return db.kids.get(id);
}

export async function reassignKid(db, kidId, newDriverId) {
  return updateKid(db, kidId, { driverId: newDriverId });
}

export async function deleteKid(db, id) {
  const n = await db.trips.where({ kidId: id }).count();
  if (n > 0) throw new Error('cannot delete: kid has history');
  await db.kids.delete(id);
}

export async function listKids(db) {
  return db.kids.orderBy('createdAt').toArray();
}

export async function getKid(db, id) {
  return db.kids.get(id);
}
