import { friendlyAuthError, isValidEmail, parseAuthRedirect, passwordProblem } from '@/lib/auth-helpers';

describe('isValidEmail', () => {
  it.each(['a@b.co', ' learner@example.com ', 'x.y+z@mail.example.org'])('accepts %s', (e) =>
    expect(isValidEmail(e)).toBe(true),
  );
  it.each(['', 'abc', 'a@b', 'a b@c.com', '@example.com', 'a@b.c'])('rejects %s', (e) =>
    expect(isValidEmail(e)).toBe(false),
  );
});

describe('passwordProblem', () => {
  it('requires 8 characters', () => {
    expect(passwordProblem('1234567')).toMatch(/8 characters/);
    expect(passwordProblem('12345678')).toBeNull();
  });
});

describe('parseAuthRedirect', () => {
  it('reads tokens from the hash (implicit flow)', () => {
    expect(
      parseAuthRedirect('exp://192.168.0.18:8081/--/auth/callback#access_token=abc&refresh_token=def&token_type=bearer'),
    ).toEqual({ kind: 'tokens', accessToken: 'abc', refreshToken: 'def' });
  });
  it('reads tokens from the query', () => {
    expect(parseAuthRedirect('hskchinese://auth/callback?access_token=a%2Bb&refresh_token=c')).toEqual({
      kind: 'tokens',
      accessToken: 'a+b',
      refreshToken: 'c',
    });
  });
  it('prefers the error description', () => {
    expect(
      parseAuthRedirect('http://localhost:8081/auth/callback?error=access_denied&error_description=User+cancelled+login'),
    ).toEqual({ kind: 'error', message: 'User cancelled login' });
  });
  it('returns none for unrelated URLs', () => {
    expect(parseAuthRedirect('http://localhost:8081/auth/callback')).toEqual({ kind: 'none' });
    expect(parseAuthRedirect('http://localhost:8081/?access_token=only')).toEqual({ kind: 'none' });
  });
});

describe('friendlyAuthError', () => {
  it('maps known Supabase messages', () => {
    expect(friendlyAuthError(new Error('Invalid login credentials'))).toBe('Wrong email or password.');
    expect(friendlyAuthError(new Error('User already registered'))).toMatch(/already exists/);
    expect(friendlyAuthError(new Error('Token has expired or is invalid'))).toMatch(/code is wrong/);
    expect(friendlyAuthError(new Error('email rate limit exceeded'))).toMatch(/Too many/);
  });
  it('passes through other messages and handles non-errors', () => {
    expect(friendlyAuthError(new Error('Disk full'))).toBe('Disk full');
    expect(friendlyAuthError(undefined)).toMatch(/Something went wrong/);
  });
});
