// Manual formatter — Intl currency formatting with IDR injects a non-breaking space
// between "Rp" and the digits, which breaks strict equality with a regular " ".
export function rupiah(n) {
  const v = Math.round(Number(n) || 0);
  const sign = v < 0 ? '-' : '';
  const abs = Math.abs(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sign}Rp ${abs}`;
}

const dateFmt = new Intl.DateTimeFormat('id-ID', {
  day: '2-digit', month: '2-digit', year: 'numeric'
});

export function fmtDate(iso) {
  return dateFmt.format(new Date(iso));
}

export function isSameLocalDay(isoA, isoB) {
  const a = new Date(isoA), b = new Date(isoB);
  return a.getFullYear() === b.getFullYear()
      && a.getMonth() === b.getMonth()
      && a.getDate() === b.getDate();
}

export function todayIso() {
  return new Date().toISOString();
}
