const UNREAD_KEY = 'friends_unread_map_v1';
const LAST_SEEN_KEY = 'friends_last_seen_map_v1';
const SYSTEM_READ_KEYS = 'system_notification_read_keys_v1';
const EVENT_NAME = 'uniblog_unread_changed';

type StringMap = Record<string, string>;

function readMap(key: string): StringMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== 'object') return {};
    const out: StringMap = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (typeof k === 'string' && typeof val === 'string') out[k] = val;
    }
    return out;
  } catch {
    return {};
  }
}

function writeMap(key: string, map: StringMap) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(map));
  } catch {
    // ignore
  }
}

function emitChanged() {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new Event(EVENT_NAME));
  } catch {
    // ignore
  }
}

export function getUnreadMap(): StringMap {
  return readMap(UNREAD_KEY);
}

export function getLastSeenMap(): StringMap {
  return readMap(LAST_SEEN_KEY);
}

export function setUnread(friendId: string, messageCreatedAtISO: string) {
  const unread = getUnreadMap();
  if (unread[friendId] === messageCreatedAtISO) return;
  unread[friendId] = messageCreatedAtISO;
  writeMap(UNREAD_KEY, unread);
  emitChanged();
}

export function clearUnread(friendId: string) {
  const unread = getUnreadMap();
  if (!(friendId in unread)) return;
  delete unread[friendId];
  writeMap(UNREAD_KEY, unread);
  emitChanged();
}

export function clearAllUnread() {
  writeMap(UNREAD_KEY, {});
  emitChanged();
}

export function markSeen(friendId: string, seenAtISO: string) {
  const lastSeen = getLastSeenMap();
  if (lastSeen[friendId] === seenAtISO) return;
  lastSeen[friendId] = seenAtISO;
  writeMap(LAST_SEEN_KEY, lastSeen);
  emitChanged();
}

export function hasAnyUnread(): boolean {
  const unread = getUnreadMap();
  return Object.keys(unread).length > 0;
}

export function subscribeUnreadChanged(onChange: () => void) {
  if (typeof window === 'undefined') return () => {};
  const handler = () => onChange();
  const storageHandler = (e: StorageEvent) => {
    if (e.key === UNREAD_KEY || e.key === LAST_SEEN_KEY) onChange();
  };
  window.addEventListener(EVENT_NAME, handler);
  window.addEventListener('storage', storageHandler);
  return () => {
    window.removeEventListener(EVENT_NAME, handler);
    window.removeEventListener('storage', storageHandler);
  };
}

function readStringArray(key: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    return v.filter((x) => typeof x === 'string') as string[];
  } catch {
    return [];
  }
}

function writeStringArray(key: string, arr: string[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(arr));
  } catch {
    // ignore
  }
}

export function getSystemReadKeySet(): Set<string> {
  return new Set(readStringArray(SYSTEM_READ_KEYS));
}

export function markSystemNotificationRead(key: string) {
  const set = getSystemReadKeySet();
  if (set.has(key)) return;
  set.add(key);
  writeStringArray(SYSTEM_READ_KEYS, Array.from(set));
  emitChanged();
}

export function markSystemNotificationsRead(keys: string[]) {
  if (!keys.length) return;
  const set = getSystemReadKeySet();
  let changed = false;
  for (const k of keys) {
    if (!set.has(k)) {
      set.add(k);
      changed = true;
    }
  }
  if (!changed) return;
  writeStringArray(SYSTEM_READ_KEYS, Array.from(set));
  emitChanged();
}


