import { AccessTokenVerifierProvider, type Caller } from './accessTokenVerifier.ts';
import { GoogleTokenMinterProvider } from './googleTokenMinter.ts';

/** What the app stack binds to the Worker. */
interface Env {
  /** Who signs the Access tokens: the account's team domain. */
  readonly ACCESS_ISSUER: string;
  /** The audience of the Access application in front of the Worker. */
  readonly ACCESS_AUDIENCE: string;
  /** Where the origin service answers, which is also the audience of the ID tokens it accepts. */
  readonly ORIGIN_URL: string;
  /** A key of the service account that may invoke the origin, in Google's JSON format. */
  readonly GCP_SA_KEY: string;
  /** The frontend's files, uploaded with the Worker. */
  readonly ASSETS: { fetch(request: Request): Promise<Response> };
}

/** Requests under this path are for the origin's API; the rest, for the frontend's files. */
const apiPrefix = '/api/';

/** Where the origin answers the API, as an implementation detail behind the edge. */
const originApiPrefix = '/impl/api/';

const callerSubjectHeader = 'x-codefarm-caller-subject';
const callerEmailHeader = 'x-codefarm-caller-email';

/**
 * The caller's headers that the origin gets; it gets nothing else of theirs, nor any of
 * Cloudflare's, only what the Worker sets itself.
 */
const forwardedHeaders = ['accept', 'content-type'];

/** Random bytes in hex, as the IDs of a trace context are. */
function randomHex(byteCount: number) {
  return Array.from(crypto.getRandomValues(new Uint8Array(byteCount)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

const accessTokenVerifierProvider = new AccessTokenVerifierProvider();
const googleTokenMinterProvider = new GoogleTokenMinterProvider();

/**
 * The request as the origin gets it at the path, from the caller, with the Worker's ID token, in
 * the trace.
 */
function originRequest(
  request: Request,
  originPath: string,
  caller: Caller,
  idToken: string,
  originUrl: string,
  traceId: string,
) {
  const headers = new Headers();

  for (const name of forwardedHeaders) {
    const value = request.headers.get(name);

    if (value !== null) {
      headers.set(name, value);
    }
  }

  headers.set(callerSubjectHeader, caller.subject);
  headers.set(callerEmailHeader, caller.email);
  // Cloud Run checks this one, leaving `authorization` to the origin
  headers.set('x-serverless-authorization', `Bearer ${idToken}`);
  // Sampled, so that Cloud Run records the request in the trace, and its logs under it
  headers.set('traceparent', `00-${traceId}-${randomHex(8)}-01`);

  const { search } = new URL(request.url);

  return new Request(new URL(originPath + search, originUrl), {
    method: request.method,
    headers,
    body: request.body,
    redirect: 'manual',
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Cloudflare recommends checking it, since a request may reach the Worker without passing
    // Access, e.g. through a misconfiguration
    const accessToken = request.headers.get('cf-access-jwt-assertion');

    const caller =
      accessToken === null
        ? undefined
        : await accessTokenVerifierProvider
            .provide(env.ACCESS_ISSUER)
            .verify(accessToken, env.ACCESS_AUDIENCE);

    if (caller === undefined) {
      return new Response('Forbidden', { status: 403 });
    }

    const { pathname } = new URL(request.url);

    if (!pathname.startsWith(apiPrefix)) {
      return env.ASSETS.fetch(request);
    }

    const originPath = originApiPrefix + pathname.slice(apiPrefix.length);

    const idToken = await googleTokenMinterProvider
      .provide(env.GCP_SA_KEY)
      .idTokenFor(env.ORIGIN_URL);

    const traceId = randomHex(16);

    const response = await fetch(
      originRequest(request, originPath, caller, idToken, env.ORIGIN_URL, traceId),
    );

    // Workers Logs indexes its fields, so the origin's logs can be found by the trace
    console.log({ message: 'Forwarded to the origin', traceId, status: response.status });

    return response;
  },
};
