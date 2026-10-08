import { importPKCS8, SignJWT } from 'jose';

/** The parts of a Google service account key, in Google's JSON format, that minting needs. */
interface ServiceAccountKey {
  readonly client_email: string;
  readonly private_key_id: string;
  readonly private_key: string;
  readonly token_uri: string;
}

/** Google accepts assertions valid for an hour at most, and its ID tokens last as long. */
const lifetimeSeconds = 60 * 60;

/** A token isn't reused this close to its expiry. */
const refreshMarginSeconds = 5 * 60;

/**
 * Mints Google ID tokens for a service account with its key, as Google's client libraries do: it
 * exchanges an assertion signed with the key for an ID token. Reuses each token until shortly
 * before it expires.
 */
export class GoogleTokenMinter {
  private readonly key: ServiceAccountKey;

  private readonly cachedTokens = new Map<
    string,
    { readonly idToken: string; readonly reusableUntil: number }
  >();

  constructor(keyJson: string) {
    this.key = JSON.parse(keyJson) as ServiceAccountKey;
  }

  /** An ID token for the audience, e.g. a Cloud Run service's URL. */
  async idTokenFor(audience: string): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const cachedToken = this.cachedTokens.get(audience);

    if (cachedToken !== undefined && cachedToken.reusableUntil > now) {
      return cachedToken.idToken;
    }

    // `aud` is who the assertion is for, the token endpoint; `target_audience`, the ID token
    const assertion = await new SignJWT({ target_audience: audience })
      .setProtectedHeader({ alg: 'RS256', kid: this.key.private_key_id, typ: 'JWT' })
      .setIssuer(this.key.client_email)
      .setSubject(this.key.client_email)
      .setAudience(this.key.token_uri)
      .setIssuedAt(now)
      .setExpirationTime(now + lifetimeSeconds)
      .sign(await importPKCS8(this.key.private_key, 'RS256'));

    const response = await fetch(this.key.token_uri, {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    });

    if (!response.ok) {
      throw new Error(`Minting an ID token failed: ${response.status} ${await response.text()}`);
    }

    const { id_token: idToken } = (await response.json()) as { readonly id_token: string };

    this.cachedTokens.set(audience, {
      idToken,
      reusableUntil: now + lifetimeSeconds - refreshMarginSeconds,
    });

    return idToken;
  }
}

/**
 * Provides the minter, caching it, so its tokens are reused across requests. The key can't change
 * while the Worker runs, since a new one comes with a new version, so asking for another is a bug.
 */
export class GoogleTokenMinterProvider {
  private cachedEntry: { readonly keyJson: string; readonly minter: GoogleTokenMinter } | undefined;

  provide(keyJson: string): GoogleTokenMinter {
    if (this.cachedEntry === undefined) {
      this.cachedEntry = { keyJson, minter: new GoogleTokenMinter(keyJson) };
    } else if (this.cachedEntry.keyJson !== keyJson) {
      throw new Error('Asked for a minter of another service account key');
    }

    return this.cachedEntry.minter;
  }
}
