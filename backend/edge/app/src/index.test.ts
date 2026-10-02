import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import worker from './index.ts';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, test } from 'node:test';

const audience = 'app-audience';

const { publicKey, privateKey } = await generateKeyPair('RS256');

/** Publishes the signing key where Access publishes its keys, like a team domain would. */
let issuerServer: Server;
let issuer: string;

before(async () => {
  const keys = { keys: [{ ...(await exportJWK(publicKey)), kid: 'key', alg: 'RS256' }] };

  issuerServer = createServer((_request, response) => {
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify(keys));
  });
  await new Promise<void>((resolve) => issuerServer.listen(0, resolve));

  issuer = `http://localhost:${(issuerServer.address() as AddressInfo).port}`;
});

after(() => {
  issuerServer.close();
});

/** A token as Access issues it, unless the claims say otherwise. */
function token(claims: { iss?: string; aud?: string; exp?: number } = {}): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'RS256', kid: 'key' })
    .setIssuer(claims.iss ?? issuer)
    .setAudience(claims.aud ?? audience)
    .setIssuedAt()
    .setExpirationTime(claims.exp ?? '5 minutes')
    .sign(privateKey);
}

async function fetchWith(assertion: string | undefined, accessIssuer = issuer): Promise<Response> {
  const headers = assertion === undefined ? {} : { 'cf-access-jwt-assertion': assertion };

  return worker.fetch(new Request('https://app.example/', { headers }), {
    ACCESS_ISSUER: accessIssuer,
    ACCESS_AUDIENCE: audience,
    ENVIRONMENT: 'test',
  });
}

describe('the Worker', () => {
  test('serves the page to whoever Access signed in', async () => {
    const response = await fetchWith(await token());

    assert.equal(response.status, 200);
    assert.match(await response.text(), /Hello from Codefarm \(test\)/);
  });

  test('refuses a request without a token', async () => {
    assert.equal((await fetchWith(undefined)).status, 403);
  });

  test('refuses a token for another application', async () => {
    assert.equal((await fetchWith(await token({ aud: 'another-audience' }))).status, 403);
  });

  test('refuses a token from another issuer', async () => {
    assert.equal((await fetchWith(await token({ iss: 'https://another.example' }))).status, 403);
  });

  test('refuses an expired token', async () => {
    const exp = Math.floor(Date.now() / 1000) - 60 * 60;

    assert.equal((await fetchWith(await token({ exp }))).status, 403);
  });

  test('refuses a malformed token', async () => {
    assert.equal((await fetchWith('not.a.token')).status, 403);
  });

  test("fails rather than refuses when the issuer's keys can't be fetched", async () => {
    await assert.rejects(
      fetchWith(await token({ iss: 'http://localhost:1' }), 'http://localhost:1'),
    );
  });
});
