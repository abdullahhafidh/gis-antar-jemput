import { registerStores } from './store.js';
import { startRouter } from './router.js';

document.addEventListener('alpine:init', () => {
  registerStores(globalThis.Alpine);
});

document.addEventListener('alpine:initialized', async () => {
  const app = globalThis.Alpine.store('app');
  try {
    await app.init();
  } catch (err) {
    document.getElementById('view-root').innerHTML =
      `<div class="error-screen">
         <h2>Storage unavailable</h2>
         <p>This app needs IndexedDB. The browser refused with: <code>${err.message}</code>.</p>
         <p>If you're in Private/Incognito mode, try a regular window.</p>
       </div>`;
    return;
  }
  startRouter(route => app.routeChanged(route));
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW failed', err));
  });
}

function paintActiveTab(route) {
  const map = { home: '/', drivers: '/drivers', driverDetail: '/drivers', kids: '/kids' };
  const target = map[route.name] || '/';
  document.querySelectorAll('#tabbar a').forEach(a => {
    a.classList.toggle('active', a.dataset.route === target);
  });
}
document.addEventListener('alpine:initialized', () => {
  const app = globalThis.Alpine.store('app');
  const orig = app.routeChanged.bind(app);
  app.routeChanged = (r) => { orig(r); paintActiveTab(r); };
});
