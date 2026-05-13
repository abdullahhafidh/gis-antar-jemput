import { db } from './db.js';

async function boot() {
  await db.open();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW failed', err));
  }
  document.body.removeAttribute('x-cloak');
  console.log('Boot complete');
}
boot().catch(err => {
  document.getElementById('view-root').textContent = 'Startup error: ' + err.message;
});
