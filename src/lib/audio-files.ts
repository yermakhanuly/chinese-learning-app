/** Web: no offline audio (the browser caches clips itself). */
export function localClipUri(_key: string): string | null {
  return null;
}

export async function downloadClips(_items: { key: string; url: string }[], _progress: (done: number, total: number) => void) {
  return { failed: 0 };
}

export function downloadedClips(): { count: number; bytes: number } {
  return { count: 0, bytes: 0 };
}

export function deleteDownloadedClips() {}
