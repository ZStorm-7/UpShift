// Tiny pub/sub so a write made outside a screen (the floating coach logging a
// meal) can tell the screens that cache that data in state to reload. Needed
// because the stack keeps Dashboard and Nutrition mounted under the coach, so
// they never get a "focus" event to refetch on.

type Listener = () => void;
const listeners = new Set<Listener>();

export function onDayDataChanged(l: Listener): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export function emitDayDataChanged(): void {
  listeners.forEach(l => { try { l(); } catch { /* a bad listener must not break the others */ } });
}
