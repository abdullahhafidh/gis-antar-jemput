const sessionId = Math.random().toString(36).substring(7);
console.log('[db.js] Module loaded. Session:', sessionId);

export function createDb(name) {
  console.log('Creating DB instance:', name);
  const db = new globalThis.Dexie(name);
  if (db.isOpen()) {
    console.warn('DB is already open!');
  }
  db.on('versionchange', () => {
    console.warn('DB versionchange event! Closing DB...');
    db.close();
  });
  db.version(2).stores({
    drivers: '++id,name,createdAt,archived',
    kids:    '++id,name,driverId,createdAt',
    trips:   '++id,driverId,kidId,type,occurredAt',
    topups:  '++id,driverId,occurredAt'
  });
  console.log('DB created:', db.name, 'v' + db.verno);
  
  const _origTx = db.transaction.bind(db);
  db.transaction = (...args) => {
    const id = Math.random().toString(36).substring(7);
    const cb = args.pop();
    if (typeof cb !== 'function') {
      return _origTx(...args, cb);
    }
    console.log(`[db] TX ${id} START`, args);
    return _origTx(...args, async () => {
      const res = await cb();
      console.log(`[db] TX ${id} CB_DONE`);
      return res;
    }).then(res => {
      console.log(`[db] TX ${id} COMMITTED`);
      return res;
    }).catch(err => {
      console.error(`[db] TX ${id} ROLLBACK`, err);
      throw err;
    });
  };

  return db;
}
export const db = createDb('gisv10');
