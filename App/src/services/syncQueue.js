// Offline-first synchronisation queue for driver mutations.
//
// Delivery outcomes, location pings and other mutations are enqueued here and
// flushed to the server when connectivity allows. Guarantees:
//   - Durable across app restarts (AsyncStorage).
//   - Idempotent: each op carries a stable id used both to dedupe locally and
//     as the server idempotency key, so a retry cannot double-apply.
//   - Retry with exponential backoff (bounded).
//   - Network failures retry; server-side rejections (4xx that are not 401)
//     are treated as terminal "conflicts" and surfaced rather than retried
//     forever — the driver's captured evidence is preserved in the op.
//
// The pure pieces (backoff, dedupe, the reducer that decides what to do with a
// processing result) are exported for unit testing without storage/NetInfo.

import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

import { NETWORK } from '../config';
import { ApiError } from './http';

const STORAGE_KEY = 'aiviate_sync_queue';

export function computeBackoff(attempts, { base = NETWORK.retryBaseMs, max = NETWORK.retryMaxMs } = {}) {
  const raw = base * Math.pow(2, Math.max(0, attempts - 1));
  return Math.min(raw, max);
}

// Decide the fate of an op given the outcome of trying to process it.
// Returns one of: { action: 'remove' } | { action: 'retry', delayMs } | { action: 'fail', reason }
export function resolveOutcome(op, result) {
  if (result.ok) return { action: 'remove' };
  const err = result.error;
  const isNetwork = err instanceof ApiError ? err.isNetwork : true;
  const status = err instanceof ApiError ? err.status : 0;

  // Terminal, non-retryable server rejection (e.g. 404 reassigned, 409 conflict,
  // 403 suspended). Keep the driver's captured payload; surface as a conflict.
  if (!isNetwork && status >= 400 && status < 500 && status !== 401) {
    return { action: 'fail', reason: err.message || `Rejected (${status})` };
  }
  // Network / 5xx / timeout → retry unless we've exhausted attempts.
  if (op.attempts >= NETWORK.maxAttempts) {
    return { action: 'fail', reason: 'Max retry attempts reached' };
  }
  return { action: 'retry', delayMs: computeBackoff(op.attempts + 1) };
}

export class SyncQueue {
  constructor({ storage = AsyncStorage, netinfo = NetInfo, now = () => Date.now() } = {}) {
    this.storage = storage;
    this.netinfo = netinfo;
    this.now = now;
    this.processors = new Map(); // type -> async (payload, op) => any
    this.listeners = new Set();
    this.ops = [];
    this._loaded = false;
    this._flushing = false;
    this._unsub = null;
  }

  registerProcessor(type, fn) {
    this.processors.set(type, fn);
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  _emit() {
    const snapshot = this.status();
    this.listeners.forEach((fn) => {
      try { fn(snapshot); } catch { /* listener errors must not break the queue */ }
    });
  }

  async _persist() {
    await this.storage.setItem(STORAGE_KEY, JSON.stringify(this.ops));
    this._emit();
  }

  async load() {
    const raw = await this.storage.getItem(STORAGE_KEY);
    this.ops = raw ? safeParse(raw) : [];
    this._loaded = true;
    this._emit();
    return this.ops;
  }

  start() {
    if (this._unsub) return;
    this._unsub = this.netinfo.addEventListener((state) => {
      if (state?.isConnected) this.flush();
    });
  }

  stop() {
    if (this._unsub) { this._unsub(); this._unsub = null; }
  }

  status() {
    const pending = this.ops.filter((o) => o.state !== 'failed').length;
    const failed = this.ops.filter((o) => o.state === 'failed');
    return { pending, failed: failed.length, failedOps: failed, total: this.ops.length };
  }

  // Enqueue an op. `id` MUST be stable for a given logical action so retries
  // and accidental double-taps collapse to one entry (and one server write).
  async enqueue({ id, type, payload }) {
    if (!this._loaded) await this.load();
    if (this.ops.some((o) => o.id === id)) return this.ops.find((o) => o.id === id); // dedupe
    const op = {
      id,
      type,
      payload,
      attempts: 0,
      state: 'pending',
      createdAt: this.now(),
      nextAttemptAt: 0,
      lastError: null,
    };
    this.ops.push(op);
    await this._persist();
    await this.flush(); // immediate attempt (fast-rejects when offline)
    return op;
  }

  async flush() {
    // If a flush is already running, ask it to run one more pass afterwards so
    // a trigger arriving mid-flush (e.g. a connectivity event) is never lost.
    if (this._flushing) { this._flushAgain = true; return; }
    if (!this._loaded) await this.load();
    this._flushing = true;
    try {
      for (const op of [...this.ops]) {
        if (op.state === 'failed') continue;
        if (op.nextAttemptAt && op.nextAttemptAt > this.now()) continue;
        const processor = this.processors.get(op.type);
        if (!processor) continue;

        op.attempts += 1;
        let result;
        try {
          await processor(op.payload, op);
          result = { ok: true };
        } catch (error) {
          result = { ok: false, error };
        }

        const decision = resolveOutcome(op, result);
        if (decision.action === 'remove') {
          this.ops = this.ops.filter((o) => o.id !== op.id);
        } else if (decision.action === 'retry') {
          op.nextAttemptAt = this.now() + decision.delayMs;
          op.lastError = result.error?.message || 'retrying';
        } else if (decision.action === 'fail') {
          op.state = 'failed';
          op.lastError = decision.reason;
        }
        await this._persist();
      }
    } finally {
      this._flushing = false;
    }
    if (this._flushAgain) { this._flushAgain = false; await this.flush(); }
  }

  // Remove a terminally-failed op after the driver has acknowledged the
  // conflict (e.g. admin reassigned the route). Returns the removed op so the
  // caller can preserve any captured evidence for recovery.
  async discard(id) {
    const op = this.ops.find((o) => o.id === id);
    this.ops = this.ops.filter((o) => o.id !== id);
    await this._persist();
    return op || null;
  }
}

function safeParse(raw) {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

// App-wide singleton.
export const syncQueue = new SyncQueue();
export default syncQueue;
