// Phase 22 — StoreKit 2 transaction JWS verification.
//
// StoreKit 2 hands the iOS client a signed JWS (JWT) for each
// transaction. We verify it server-side before granting the Pro
// entitlement so a malicious client can't synthesize a fake purchase.
//
// V1 verification path (per the spec; Server Notifications V2 is the
// follow-up):
//   1. Parse the JWS header → x5c certificate chain.
//   2. Verify the JWS signature using the leaf certificate's public key.
//   3. Walk the chain: leaf signed by intermediate signed by Apple Root CA G3.
//   4. Parse the payload and validate bundleId + expiresDate.
//
// Apple Root CA - G3 PEM below is the public root distributed at
// https://www.apple.com/certificateauthority/ — not a secret.

import crypto, { X509Certificate } from 'node:crypto';

const APPLE_ROOT_CA_G3_PEM = `-----BEGIN CERTIFICATE-----
MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwS
QXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9u
IEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcN
MTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBS
b290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9y
aXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49
AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtf
TjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517
IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySr
MA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gA
MGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4
at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM
6BgD56KyKA==
-----END CERTIFICATE-----`;

const APPLE_ROOT = new X509Certificate(APPLE_ROOT_CA_G3_PEM);

// Bundle ID the client transactions must claim. Pulled from env so the
// dev build (com.thefoodieai.foodieai.debug, for example) and prod
// build can both work without code changes. Falls back to the prod
// bundle to fail safe.
const EXPECTED_BUNDLE_ID = process.env.APP_BUNDLE_ID || 'com.thefoodieai.foodieai';

function base64UrlDecode(str) {
  const padded = (str + '==='.slice((str.length + 3) % 4))
    .replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(padded, 'base64');
}

// Verify a StoreKit 2 JWS transaction. Returns the parsed payload on
// success. Throws Error with a short reason string on any failure —
// the route catches and returns a 400 to the client.
export function verifyStoreKitTransaction(jws) {
  if (typeof jws !== 'string' || !jws) {
    throw new Error('JWS missing');
  }
  const parts = jws.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed JWS');
  }
  const [headerB64, payloadB64, sigB64] = parts;

  let header;
  try {
    header = JSON.parse(base64UrlDecode(headerB64).toString('utf8'));
  } catch (e) {
    throw new Error('Header parse failed');
  }
  if (header.alg !== 'ES256') {
    throw new Error(`Unsupported alg: ${header.alg}`);
  }
  if (!Array.isArray(header.x5c) || header.x5c.length === 0) {
    throw new Error('Missing x5c chain');
  }

  // Build the cert chain. x5c values are base64 (NOT base64url) DER.
  let chain;
  try {
    chain = header.x5c.map(b64 => new X509Certificate(Buffer.from(b64, 'base64')));
  } catch (e) {
    throw new Error('Invalid certificate in chain');
  }

  // Verify chain links. Each cert must be signed by the next one up.
  for (let i = 0; i < chain.length - 1; i++) {
    if (!chain[i].verify(chain[i + 1].publicKey)) {
      throw new Error(`Chain link ${i} not signed by chain[${i + 1}]`);
    }
  }
  // Top of chain must be signed by Apple Root CA G3.
  const top = chain[chain.length - 1];
  if (!top.verify(APPLE_ROOT.publicKey)) {
    throw new Error('Chain not anchored to Apple Root CA - G3');
  }

  // Verify JWS signature using leaf cert public key. JWS encodes ECDSA
  // signatures as raw r||s (64 bytes for P-256); Node accepts that
  // directly via dsaEncoding: 'ieee-p1363'.
  const signature = base64UrlDecode(sigB64);
  const signingInput = `${headerB64}.${payloadB64}`;
  const verifier = crypto.createVerify('SHA256');
  verifier.update(signingInput);
  verifier.end();
  const ok = verifier.verify(
    { key: chain[0].publicKey, dsaEncoding: 'ieee-p1363' },
    signature
  );
  if (!ok) {
    throw new Error('Signature verification failed');
  }

  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(payloadB64).toString('utf8'));
  } catch (e) {
    throw new Error('Payload parse failed');
  }

  if (payload.bundleId !== EXPECTED_BUNDLE_ID) {
    throw new Error(`Bundle mismatch: ${payload.bundleId}`);
  }

  // expiresDate is milliseconds since epoch (StoreKit 2 convention).
  // For auto-renewable subscriptions it must be present; if it's
  // missing the transaction isn't a subscription we can grant Pro on.
  if (typeof payload.expiresDate !== 'number') {
    throw new Error('No expiresDate on transaction');
  }
  if (payload.expiresDate <= Date.now()) {
    throw new Error('Transaction already expired');
  }

  return payload;
}
