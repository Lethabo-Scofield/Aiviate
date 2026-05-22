// Tiny module-scoped queue for cross-route "ask" delivery.
//
// When the user submits an Ask from a non-home page, Layout navigates
// to "/", but Operations doesn't mount immediately (the route transition
// runs an AnimatePresence exit first). A window event would fire before
// the listener exists. Instead we drop the text here and let Operations
// drain it the moment it mounts. Reliable regardless of transition timing.

let _pending = null;

export function setPendingAsk(text) {
  _pending = typeof text === "string" ? text : "";
}

/** Returns the queued ask (possibly "") and clears it. Returns null if nothing queued. */
export function takePendingAsk() {
  if (_pending === null) return null;
  const v = _pending;
  _pending = null;
  return v;
}
