import { useSyncExternalStore } from 'react';

import { isOnline, onOnlineChange } from '@/lib/network';
import { getItem, removeItem, setItem } from '@/lib/storage';

/**
 * Offline study (iPhone): a device copy of what was downloaded or last loaded (lessons, the
 * course, progress, today's reviews), and an outbox of answers given while offline that is sent
 * when the device is back online.
 * On the web nothing is kept (browsers have little storage and the web app needs a connection).
 */
const NATIVE = process.env.EXPO_OS !== 'web';

/** A request that never reached the server (no connection), as opposed to one it refused. */
export function isNetworkError(error: unknown): boolean {
  if (!isOnline()) return true;
  const e = error as { message?: string; name?: string; code?: string; status?: number } | null;
  if (!e) return false;
  if (e.code && /^[0-9A-Z]{5}$/.test(e.code)) return false; // a Postgres error: the server answered
  const msg = `${e.name ?? ''} ${e.message ?? ''}`;
  return /network request failed|failed to fetch|load failed|network ?error|timed? ?out|offline|ECONN|ENOTFOUND/i.test(msg);
}

// --- Device copy ----------------------------------------------------------------------------------

const CACHE = 'offline:cache:';

export function saveCopy(key: string, value: unknown) {
  if (!NATIVE) return;
  try {
    setItem(CACHE + key, JSON.stringify(value));
  } catch {
    // Storage full: the copy just isn't kept.
  }
}

export function readCopy<T>(key: string): T | undefined {
  if (!NATIVE) return undefined;
  const raw = getItem(CACHE + key);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

/**
 * Loads from the server and keeps a device copy; with no connection, returns the copy instead.
 * Wrap a query's fetch with it: `queryFn: () => withCopy('lesson:' + id, fetchLesson)`.
 */
export async function withCopy<T>(key: string, load: () => Promise<T>, revive?: (stored: unknown) => T): Promise<T> {
  try {
    const value = await load();
    saveCopy(key, value instanceof Map ? { __map: [...value.entries()] } : value);
    return value;
  } catch (error) {
    if (!NATIVE || !isNetworkError(error)) throw error;
    const copy = readCopy<unknown>(key);
    if (copy === undefined) throw error;
    if (revive) return revive(copy);
    if (copy && typeof copy === 'object' && '__map' in copy) return new Map((copy as { __map: [unknown, unknown][] }).__map) as T;
    return copy as T;
  }
}

// --- Outbox ---------------------------------------------------------------------------------------

export type OutboxItem =
  | { id: string; type: 'review'; at: string; cardId: string; grade: number; card: unknown }
  | { id: string; type: 'lesson'; at: string; lessonId: string; score: number; missed: string[] };

const OUTBOX = 'offline:outbox';
const listeners = new Set<() => void>();
let items: OutboxItem[] = load();

function load(): OutboxItem[] {
  try {
    return JSON.parse(getItem(OUTBOX) ?? '[]') as OutboxItem[];
  } catch {
    return [];
  }
}

function store(next: OutboxItem[]) {
  items = next;
  if (next.length) setItem(OUTBOX, JSON.stringify(next));
  else removeItem(OUTBOX);
  listeners.forEach((l) => l());
}

type NewItem = OutboxItem extends infer T ? (T extends OutboxItem ? Omit<T, 'id'> : never) : never;

export function enqueue(item: NewItem) {
  store([...items, { ...item, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` } as OutboxItem]);
}

export function outboxItems() {
  return items;
}

type Sender = (item: OutboxItem) => Promise<void>;
let sender: Sender | null = null;
let flushing: Promise<void> | null = null;
const syncedListeners = new Set<() => void>();

/** Registered once by the app: how to send each kind of item (the same calls as when online). */
export function setOutboxSender(send: Sender) {
  sender = send;
}

/** Called after items were sent, so screens can refresh. */
export function onSynced(listener: () => void) {
  syncedListeners.add(listener);
  return () => void syncedListeners.delete(listener);
}

/**
 * Sends waiting items in order. Stops at the first network error (tries again later); an item
 * the server refuses (e.g. a card deleted meanwhile) is dropped so it can't block the rest.
 */
export function flushOutbox(): Promise<void> {
  if (flushing) return flushing;
  flushing = (async () => {
    let sent = 0;
    while (items.length && sender) {
      const item = items[0];
      try {
        await sender(item);
      } catch (error) {
        if (isNetworkError(error)) break;
      }
      store(items.filter((i) => i.id !== item.id));
      sent++;
    }
    if (sent) syncedListeners.forEach((l) => l());
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

onOnlineChange((online) => {
  if (online) void flushOutbox();
});

function subscribe(l: () => void) {
  listeners.add(l);
  return () => void listeners.delete(l);
}

/** Answers waiting to be sent, and whether the device is online. */
export function useOfflineState() {
  const waiting = useSyncExternalStore(subscribe, () => items.length, () => 0);
  const online = useSyncExternalStore(
    (l) => onOnlineChange(() => l()),
    isOnline,
    () => true,
  );
  return { waiting, online };
}
