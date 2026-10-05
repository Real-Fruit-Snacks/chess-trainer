/**
 * The PKCE half of "Log in with Lichess" (RFC 7636): a random code verifier
 * that never leaves the device until the token exchange, and its SHA-256
 * challenge, which goes to Lichess with the authorization request. Lichess
 * accepts only the `S256` method.
 */

/** Base64url without padding. */
export function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** A fresh random string of `byteLength` random bytes, base64url-encoded. */
export function randomToken(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

/** A code verifier: 43–128 characters of the unreserved set (here, 86). */
export function createCodeVerifier(): string {
  return randomToken(64);
}

/** `BASE64URL(SHA256(verifier))`. */
export async function codeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}
