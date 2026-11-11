import { Directory, File, Paths } from 'expo-file-system';

/** iPhone: audio clips downloaded for offline study, in the app's documents folder. */
function folder() {
  const dir = new Directory(Paths.document, 'audio');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

/** The downloaded clip for an audio key, if there is one. */
export function localClipUri(key: string): string | null {
  try {
    const f = new File(folder(), `${key}.mp3`);
    return f.exists ? f.uri : null;
  } catch {
    return null;
  }
}

/** Downloads clips that aren't on the device yet; calls `progress` after each one. */
export async function downloadClips(items: { key: string; url: string }[], progress: (done: number, total: number) => void) {
  const dir = folder();
  let done = 0;
  let failed = 0;
  for (const { key, url } of items) {
    const target = new File(dir, `${key}.mp3`);
    if (!target.exists) {
      try {
        await File.downloadFileAsync(url, target);
      } catch {
        failed++;
        // A half-written file would look downloaded: remove it.
        try {
          if (target.exists) target.delete();
        } catch {
          // ignore
        }
      }
    }
    progress(++done, items.length);
  }
  return { failed };
}

/** Number of downloaded clips and their size in bytes. */
export function downloadedClips(): { count: number; bytes: number } {
  try {
    const files = folder().list().filter((f): f is File => f instanceof File);
    return { count: files.length, bytes: files.reduce((n, f) => n + (f.size ?? 0), 0) };
  } catch {
    return { count: 0, bytes: 0 };
  }
}

export function deleteDownloadedClips() {
  try {
    const dir = new Directory(Paths.document, 'audio');
    if (dir.exists) dir.delete();
  } catch {
    // nothing to delete
  }
}
