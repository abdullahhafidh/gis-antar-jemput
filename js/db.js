export function createDb(name) {
  const db = new globalThis.Dexie(name);
  db.version(1).stores({
    drivers: '++id, name, createdAt, archived',
    kids:    '++id, name, driverId, createdAt',
    trips:   '++id, driverId, kidId, type, occurredAt',
    topups:  '++id, driverId, occurredAt'
  });
  return db;
}
export const db = createDb('gis-antar-jemput');
