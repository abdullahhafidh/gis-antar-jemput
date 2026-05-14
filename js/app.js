import { registerStores } from './store.js';
import { startRouter } from './router.js';

document.addEventListener('alpine:init', () => {
  registerStores(globalThis.Alpine);
});

document.addEventListener('alpine:initialized', async () => {
  const app = globalThis.Alpine.store('app');
  await app.init();
  startRouter(route => app.routeChanged(route));
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW failed', err));
  });
}
