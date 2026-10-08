import { exportJWK, exportPKCS8, generateKeyPair, jwtVerify, SignJWT } from 'jose';
import worker from './index.ts';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, test } from 'node:test';

const audience = 'app-audience';

/** What Access signs its tokens with. */
const access = await generateKeyPair('RS256');

/** The origin invoker's service account key. */
const serviceAccount = await generateKeyPair('RS256', { extractable: true });

/** What the fake origin was asked, as it echoes it back. */
interface Forwarded {
  readonly url: string;
  readonly headers: Record<string, string>;
}

let google: Server;
let origin: Server;
let issuer: string;
let originUrl: string;
let serviceAccountKey: string;

/** How many ID tokens Google's fake token endpoint minted. */
let minted = 0;

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = '';
    request.on('data', (chunk: Buffer) => (body += chunk.toString()));
    request.on('end', () => resolve(body));
  });
}

function listen(server: Server): Promise<string> {
  return new Promise((resolve) =>
    server.listen(0, () => resolve(`http://localhost:${(server.address() as AddressInfo).port}`)),
  );
}

before(async () => {
  const keys = { keys: [{ ...(await exportJWK(access.publicKey)), kid: 'key', alg: 'RS256' }] };

  // Plays both the Access team domain, publishing its keys, and Google's token endpoint
  google = createServer(async (request, response) => {
    if (request.url === '/cdn-cgi/access/certs') {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify(keys));
      return;
    }

    // Checks the assertion as Google would: signed with the key, for this endpoint and the origin
    const assertion = new URLSearchParams(await readBody(request)).get('assertion') ?? '';
    const { payload } = await jwtVerify(assertion, serviceAccount.publicKey, {
      issuer: 'edge-invoker@project.iam.gserviceaccount.com',
      audience: `${issuer}/token`,
    }).catch(() => ({ payload: {} as Record<string, unknown> }));
    if (payload['target_audience'] !== originUrl) {
      response.statusCode = 400;
      response.end('Invalid assertion');
      return;
    }

    minted += 1;
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ id_token: `id-token-${minted}` }));
  });
  issuer = await listen(google);

  origin = createServer((request, response) => {
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ url: request.url, headers: request.headers }));
  });
  originUrl = await listen(origin);

  serviceAccountKey = JSON.stringify({
    client_email: 'edge-invoker@project.iam.gserviceaccount.com',
    private_key_id: 'service-account-key',
    private_key: await exportPKCS8(serviceAccount.privateKey),
    token_uri: `${issuer}/token`,
  });
});

after(() => {
  google.close();
  origin.close();
});

/** A token as Access issues it, unless the claims say otherwise. */
function token(
  claims: { iss?: string; aud?: string; exp?: number; email?: string | undefined } = {},
): Promise<string> {
  return new SignJWT('email' in claims ? { email: claims.email } : { email: 'person@example.com' })
    .setProtectedHeader({ alg: 'RS256', kid: 'key' })
    .setIssuer(claims.iss ?? issuer)
    .setAudience(claims.aud ?? audience)
    .setSubject('person')
    .setIssuedAt()
    .setExpirationTime(claims.exp ?? '5 minutes')
    .sign(access.privateKey);
}

async function fetchWith(
  assertion: string | undefined,
  { path = '/api/hello', headers = {} } = {},
): Promise<Response> {
  return worker.fetch(
    new Request(`https://app.example${path}`, {
      headers: {
        ...headers,
        ...(assertion === undefined ? {} : { 'cf-access-jwt-assertion': assertion }),
      },
    }),
    {
      ACCESS_ISSUER: issuer,
      ACCESS_AUDIENCE: audience,
      ORIGIN_URL: originUrl,
      GCP_SA_KEY: serviceAccountKey,
      ASSETS: {
        fetch: (request) => Promise.resolve(new Response(`Asset ${new URL(request.url).pathname}`)),
      },
    },
  );
}

async function forwarded(response: Response): Promise<Forwarded> {
  assert.equal(response.status, 200);
  return (await response.json()) as Forwarded;
}

describe('the Worker', () => {
  test("forwards API requests of whoever Access signed in to the origin's API", async () => {
    const { url, headers } = await forwarded(
      await fetchWith(await token(), { path: '/api/hello?name=world' }),
    );

    assert.equal(url, '/impl/api/hello?name=world');
    assert.equal(headers['x-codefarm-caller-subject'], 'person');
    assert.equal(headers['x-codefarm-caller-email'], 'person@example.com');
    assert.match(headers['x-serverless-authorization'] ?? '', /^Bearer id-token-\d+$/);
  });

  test('passes on only the allowed headers of the caller, besides its own', async () => {
    const { headers } = await forwarded(
      await fetchWith(await token(), {
        headers: {
          accept: 'application/json',
          'content-type': 'text/plain',
          cookie: 'session=secret',
          'cf-ray': 'ray',
          'x-other': 'other',
          'x-codefarm-caller-email': 'someone-else@example.com',
          'x-serverless-authorization': 'Bearer forged',
        },
      }),
    );

    assert.equal(headers['accept'], 'application/json');
    assert.equal(headers['content-type'], 'text/plain');

    assert.equal(headers['cookie'], undefined);
    assert.equal(headers['cf-ray'], undefined);
    assert.equal(headers['x-other'], undefined);
    assert.equal(headers['cf-access-jwt-assertion'], undefined);

    assert.equal(headers['x-codefarm-caller-email'], 'person@example.com');
    assert.notEqual(headers['x-serverless-authorization'], 'Bearer forged');
  });

  test('reuses the ID token it minted', async () => {
    const first = await forwarded(await fetchWith(await token()));
    const mintedBefore = minted;
    const second = await forwarded(await fetchWith(await token()));

    assert.equal(minted, mintedBefore);
    assert.equal(
      second.headers['x-serverless-authorization'],
      first.headers['x-serverless-authorization'],
    );
  });

  test("serves other requests from the frontend's files", async () => {
    for (const path of ['/', '/settings', '/apiary', '/api']) {
      const response = await fetchWith(await token(), { path });

      assert.equal(await response.text(), `Asset ${path}`);
    }
  });

  test("refuses the frontend's files without a token too", async () => {
    assert.equal((await fetchWith(undefined, { path: '/' })).status, 403);
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

  test('refuses a token without an email', async () => {
    assert.equal((await fetchWith(await token({ email: undefined }))).status, 403);
  });

  test('refuses a malformed token', async () => {
    assert.equal((await fetchWith('not.a.token')).status, 403);
  });
});
