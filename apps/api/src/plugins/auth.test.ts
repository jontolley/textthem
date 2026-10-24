import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyRequest } from 'fastify';

const getAuth = vi.fn();
vi.mock('@clerk/fastify', () => ({ getAuth: (request: unknown) => getAuth(request) }));

const { clerkAuthenticator } = await import('./auth.js');

const request = {} as FastifyRequest;
const authenticate = clerkAuthenticator(['https://textthem.app']);

beforeEach(() => getAuth.mockReset());

describe('clerkAuthenticator', () => {
  it('accepts a token issued to the dashboard', () => {
    getAuth.mockReturnValue({ userId: 'user_1', sessionClaims: { azp: 'https://textthem.app' } });
    expect(authenticate(request)).toBe('user_1');
  });

  it('rejects a token issued to another origin', () => {
    getAuth.mockReturnValue({ userId: 'user_1', sessionClaims: { azp: 'https://evil.example' } });
    expect(authenticate(request)).toBeNull();
  });

  it('accepts a token without an azp claim, as Clerk does', () => {
    getAuth.mockReturnValue({ userId: 'user_1', sessionClaims: {} });
    expect(authenticate(request)).toBe('user_1');
  });

  it('returns null when nobody is signed in', () => {
    getAuth.mockReturnValue({ userId: null, sessionClaims: null });
    expect(authenticate(request)).toBeNull();
  });
});
