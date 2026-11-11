/**
 * Offline study: device copies, the outbox and its sync. Storage and network state are replaced
 * with in-mockMemory fakes.
 */
const mem = (): Map<string, string> => ((globalThis as { mockMemory?: Map<string, string> }).mockMemory ??= new Map());
jest.mock('@/lib/storage', () => {
  const m = () => ((globalThis as { mockMemory?: Map<string, string> }).mockMemory ??= new Map<string, string>());
  return {
    getItem: (k: string) => m().get(k) ?? null,
    setItem: (k: string, v: string) => void m().set(k, v),
    removeItem: (k: string) => void m().delete(k),
  };
});
let mockOnline = true; // mirrored to globalThis for the mock
Object.defineProperty(globalThis, 'mockOnline', { get: () => mockOnline, configurable: true });
// offline.ts subscribes when it loads (before this file's variables exist), so the set lives on globalThis.
const mockListeners = (): Set<(o: boolean) => void> =>
  ((globalThis as { mockOnlineListeners?: Set<(o: boolean) => void> }).mockOnlineListeners ??= new Set());
jest.mock('@/lib/network', () => ({
  isOnline: () => (globalThis as { mockOnline?: boolean }).mockOnline !== false,
  onOnlineChange: (l: (o: boolean) => void) => {
    const set = ((globalThis as { mockOnlineListeners?: Set<(o: boolean) => void> }).mockOnlineListeners ??= new Set());
    set.add(l);
    return () => set.delete(l);
  },
}));

function setOnline(value: boolean) {
  mockOnline = value;
  mockListeners().forEach((l) => l(value));
}

// eslint-disable-next-line import/first
import { enqueue, flushOutbox, isNetworkError, onSynced, outboxItems, readCopy, setOutboxSender, withCopy } from '../offline';

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  mockOnline = true;
});

describe('isNetworkError', () => {
  it('tells a missing connection from an answer the server refused', () => {
    expect(isNetworkError(new TypeError('Network request failed'))).toBe(true);
    expect(isNetworkError({ message: 'TypeError: Failed to fetch' })).toBe(true);
    expect(isNetworkError({ code: 'P0002', message: 'card not found' })).toBe(false);
    expect(isNetworkError({ code: '22023', message: 'rating must be 1–4' })).toBe(false);
    mockOnline = false;
    expect(isNetworkError({ code: 'P0002', message: 'anything' })).toBe(true); // offline: always
  });
});

describe('withCopy', () => {
  it('keeps a copy and uses it when there is no connection', async () => {
    expect(await withCopy('lesson:a', async () => ({ title: 'Hello' }))).toEqual({ title: 'Hello' });
    expect(readCopy('lesson:a')).toEqual({ title: 'Hello' });
    const offline = await withCopy('lesson:a', async () => {
      throw new TypeError('Network request failed');
    });
    expect(offline).toEqual({ title: 'Hello' });
  });
  it('keeps Maps (lesson progress) as Maps', async () => {
    await withCopy('progress:u', async () => new Map([['l1', { best_score: 90 }]]));
    const back = await withCopy<Map<string, unknown>>('progress:u', async () => {
      throw new TypeError('Network request failed');
    });
    expect(back).toBeInstanceOf(Map);
    expect(back.get('l1')).toEqual({ best_score: 90 });
  });
  it('passes on server errors and missing copies', async () => {
    await expect(withCopy('lesson:b', async () => Promise.reject({ code: '42501', message: 'denied' }))).rejects.toMatchObject({ code: '42501' });
    await expect(withCopy('lesson:never', async () => Promise.reject(new TypeError('Network request failed')))).rejects.toThrow('Network');
  });
});

describe('outbox', () => {
  it('sends answers in order when back online, keeps them while the network is down, drops refused ones', async () => {
    const sent: string[] = [];
    let failNetwork = true;
    setOutboxSender(async (item) => {
      if (failNetwork) throw new TypeError('Network request failed');
      if (item.type === 'review' && item.cardId === 'deleted') throw { code: 'P0002', message: 'card not found' };
      sent.push(item.type === 'review' ? item.cardId : item.lessonId);
    });
    const synced = jest.fn();
    const off = onSynced(synced);

    mockOnline = false;
    enqueue({ type: 'lesson', at: '2026-11-10T08:00:00Z', lessonId: 'hsk1-u01-l1', score: 90, missed: [] });
    enqueue({ type: 'review', at: '2026-11-10T08:05:00Z', cardId: 'deleted', grade: 3, card: {} });
    enqueue({ type: 'review', at: '2026-11-10T08:06:00Z', cardId: 'c2', grade: 1, card: {} });
    expect(outboxItems()).toHaveLength(3);
    expect(JSON.parse(mem().get('offline:outbox')!)).toHaveLength(3); // survives an app restart

    mockOnline = true;
    await flushOutbox(); // the network still fails: nothing lost
    expect(outboxItems()).toHaveLength(3);
    expect(synced).not.toHaveBeenCalled();

    failNetwork = false;
    setOnline(true); // coming back online sends them
    await flush();
    await flushOutbox();
    expect(sent).toEqual(['hsk1-u01-l1', 'c2']);
    expect(outboxItems()).toEqual([]);
    expect(mem().has('offline:outbox')).toBe(false);
    expect(synced).toHaveBeenCalled();
    off();
  });
});
