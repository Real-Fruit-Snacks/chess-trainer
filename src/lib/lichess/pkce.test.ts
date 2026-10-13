import { describe, expect, it } from 'vitest';
import { base64Url, codeChallenge, createCodeVerifier, randomToken } from './pkce';

describe('PKCE', () => {
  it('derives the S256 challenge of RFC 7636, appendix B', async () => {
    expect(await codeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });

  it('makes verifiers of the allowed length and alphabet, different every time', () => {
    const a = createCodeVerifier();
    const b = createCodeVerifier();
    expect(a).toMatch(/^[A-Za-z0-9\-_]{43,128}$/);
    expect(a).toHaveLength(86);
    expect(a).not.toBe(b);
  });

  it('encodes base64url without padding', () => {
    expect(base64Url(new Uint8Array([0xfb, 0xff, 0xfe]))).toBe('-__-');
    expect(base64Url(new Uint8Array([1]))).toBe('AQ');
    expect(randomToken(24)).toMatch(/^[A-Za-z0-9\-_]{32}$/);
  });
});
