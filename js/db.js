export function createDb(name) {
  console.log('Creating DB instance:', name);
  const db = new globalThis.Dexie(name);
  db.version(2).stores({
    drivers: '++id,name,createdAt,archived',
    kids:    '++id,name,driverId,createdAt',
    trips:   '++id,driverId,kidId,type,occurredAt',
    topups:  '++id,driverId,occurredAt'
  });
  console.log('DB created:', db.name, 'v' + db.verno);
  return db;
}
export const db = createDb('gis-antar-jemput');
