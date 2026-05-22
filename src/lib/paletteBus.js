let _open = false;
const listeners = new Set();

export function getPaletteOpen() {
  return _open;
}

export function setPaletteOpen(next) {
  const v = !!next;
  if (v === _open) return;
  _open = v;
  listeners.forEach((fn) => {
    try { fn(_open); } catch { /* ignore */ }
  });
}

export function subscribePaletteOpen(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
