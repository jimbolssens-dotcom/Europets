// app/_components/useClientAppCache.js
// The client app's saved copies (lib/viewCache.js), kept per client: a
// page shows what it last showed for the logged-in client straight away,
// then the fresh copy. Dropped on log out or when someone else logs in
// (see useClientAppSession.js).

'use client';

import { useRestoredView, writeViewCache } from '@/lib/viewCache';
import { CLIENT_APP_CACHE_PREFIX, useClientAppSession } from '@/app/_components/useClientAppSession';

export function clientAppCacheKey(clientId, name) {
  return clientId ? `${CLIENT_APP_CACHE_PREFIX}${clientId}:${name}` : null;
}

// Before the first paint, hands this client's last copy of `name` to
// `restore`.
export function useClientAppRestore(name, restore) {
  const { clientId } = useClientAppSession();
  useRestoredView(clientAppCacheKey(clientId, name), restore);
}

export function saveClientAppCopy(clientId, name, value) {
  const key = clientAppCacheKey(clientId, name);
  if (key) writeViewCache(key, value);
}
