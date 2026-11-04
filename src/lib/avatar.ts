/** Avatars are stored as a Storage path ("<user id>/avatar-123.jpg") or a full URL (Google photo). */
export const AVATAR_BUCKET = 'avatars';

export function avatarPath(userId: string, now = Date.now()): string {
  return `${userId}/avatar-${now}.jpg`;
}

/** Full URL for display; built per device so it uses this device's server address. */
export function avatarDisplayUrl(stored: string | null | undefined, supabaseUrl: string): string | null {
  if (!stored) return null;
  if (/^https?:\/\//.test(stored)) return stored;
  return `${supabaseUrl}/storage/v1/object/public/${AVATAR_BUCKET}/${stored}`;
}

export function initialsOf(name: string | null | undefined, email: string | null | undefined): string {
  const source = (name ?? '').trim() || (email ?? '').split('@')[0];
  const words = source.split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  // A Chinese name shows its first character; Latin names show up to two initials.
  if (/[㐀-鿿]/.test(words[0][0])) return words[0][0];
  return words
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
