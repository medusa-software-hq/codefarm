import { generateKeyPair, SignJWT } from 'jose';
import { AccessTokenVerifier, AccessTokenVerifierProvider } from './accessTokenVerifier.ts';
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

describe('the Access token verifier', () => {
  test("fails rather than refuses when the issuer's keys can't be fetched", async () => {
    const unreachable = 'http://localhost:1';
    const token = await new SignJWT({ email: 'person@example.com' })
      .setProtectedHeader({ alg: 'RS256', kid: 'key' })
      .setIssuer(unreachable)
      .setAudience('audience')
      .setSubject('person')
      .setExpirationTime('5 minutes')
      .sign((await generateKeyPair('RS256')).privateKey);

    await assert.rejects(new AccessTokenVerifier(unreachable).verify(token, 'audience'));
  });
});

describe('the Access token verifier provider', () => {
  test('provides the same verifier for the same issuer', () => {
    const provider = new AccessTokenVerifierProvider();

    assert.equal(
      provider.provide('https://issuer.example'),
      provider.provide('https://issuer.example'),
    );
  });

  test('refuses another issuer', () => {
    const provider = new AccessTokenVerifierProvider();
    provider.provide('https://issuer.example');

    assert.throws(() => provider.provide('https://another-issuer.example'));
  });
});
