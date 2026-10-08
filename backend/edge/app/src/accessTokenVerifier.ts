import { createRemoteJWKSet, errors, jwtVerify } from 'jose';

/** Who Cloudflare Access signed in. */
export interface Caller {
  readonly subject: string;
  readonly email: string;
}

/** Verifies the tokens one Cloudflare Access team domain issues, with the keys it publishes. */
export class AccessTokenVerifier {
  readonly issuer: string;
  private readonly keys: ReturnType<typeof createRemoteJWKSet>;

  constructor(issuer: string) {
    this.issuer = issuer;
    this.keys = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
  }

  /**
   * Who the token says Access signed in, if it's valid for the audience, i.e. the Access
   * application. Throws if the keys can't be fetched, which is an outage, not a bad token.
   */
  async verify(token: string, audience: string): Promise<Caller | undefined> {
    try {
      const { payload } = await jwtVerify(token, this.keys, {
        issuer: this.issuer,
        audience,
        algorithms: ['RS256'],
        requiredClaims: ['sub', 'email'],
      });

      return { subject: String(payload.sub), email: String(payload['email']) };
    } catch (error) {
      if (error instanceof errors.JOSEError) {
        return undefined;
      }
      throw error;
    }
  }
}

/**
 * Provides the verifier, caching it, so the issuer's keys are fetched once rather than for every
 * request. The issuer can't change while the Worker runs, so asking for another one is a bug.
 */
export class AccessTokenVerifierProvider {
  private cachedEntry:
    | { readonly issuer: string; readonly verifier: AccessTokenVerifier }
    | undefined;

  provide(issuer: string): AccessTokenVerifier {
    if (this.cachedEntry === undefined) {
      this.cachedEntry = { issuer, verifier: new AccessTokenVerifier(issuer) };
    } else if (this.cachedEntry.issuer !== issuer) {
      throw new Error(`Asked for a verifier of ${issuer}, after one of ${this.cachedEntry.issuer}`);
    }

    return this.cachedEntry.verifier;
  }
}
