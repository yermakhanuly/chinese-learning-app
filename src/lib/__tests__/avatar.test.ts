import { avatarDisplayUrl, avatarPath, base64ToBytes, initialsOf } from '@/lib/avatar';

describe('avatarDisplayUrl', () => {
  it('builds the public URL from a storage path using this device’s server address', () => {
    expect(avatarDisplayUrl('u1/avatar-1.jpg', 'http://192.168.0.18:54321')).toBe(
      'http://192.168.0.18:54321/storage/v1/object/public/avatars/u1/avatar-1.jpg',
    );
  });
  it('keeps full URLs (Google photos) as they are', () => {
    expect(avatarDisplayUrl('https://lh3.googleusercontent.com/a/x', 'http://x')).toBe('https://lh3.googleusercontent.com/a/x');
  });
  it('returns null when there is no avatar', () => {
    expect(avatarDisplayUrl(null, 'http://x')).toBeNull();
    expect(avatarDisplayUrl('', 'http://x')).toBeNull();
  });
});

describe('avatarPath', () => {
  it('stores inside the user folder (required by the storage policy)', () => {
    expect(avatarPath('abc', 42)).toBe('abc/avatar-42.jpg');
  });
});

describe('initialsOf', () => {
  it.each([
    ['Yernar Yermakhanuly', null, 'YY'],
    ['alice', null, 'A'],
    ['王小明', null, '王'],
    [null, 'learner@example.com', 'L'],
    ['  ', null, '?'],
  ])('%s / %s → %s', (name, email, expected) => expect(initialsOf(name, email)).toBe(expected));
});

describe('base64ToBytes', () => {
  it('decodes base64', () => {
    expect(Array.from(base64ToBytes('AQID'))).toEqual([1, 2, 3]);
  });
});
