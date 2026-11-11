import * as Network from 'expo-network';

/** iPhone: whether the device has a connection (expo-network), and changes to it. */
let online = true;
const listeners = new Set<(online: boolean) => void>();

void Network.getNetworkStateAsync().then((s) => setOnline(s.isConnected !== false && s.isInternetReachable !== false));
Network.addNetworkStateListener((s) => setOnline(s.isConnected !== false && s.isInternetReachable !== false));

function setOnline(value: boolean) {
  if (value === online) return;
  online = value;
  listeners.forEach((l) => l(value));
}

export function isOnline() {
  return online;
}

export function onOnlineChange(listener: (online: boolean) => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
