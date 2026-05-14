export function parseHash(hash) {
  const h = (hash || '').replace(/^#/, '');
  if (!h || h === '/') return { name: 'home', params: {} };
  const parts = h.split('/').filter(Boolean);
  if (parts[0] === 'drivers' && parts.length === 1) return { name: 'drivers', params: {} };
  if (parts[0] === 'drivers' && parts.length === 2) return { name: 'driverDetail', params: { id: Number(parts[1]) } };
  if (parts[0] === 'kids') return { name: 'kids', params: {} };
  return { name: 'home', params: {} };
}

export function startRouter(onChange) {
  const fire = () => onChange(parseHash(location.hash));
  window.addEventListener('hashchange', fire);
  fire();
}

export function go(path) {
  location.hash = path.startsWith('#') ? path : '#' + path;
}
