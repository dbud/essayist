/**
 * Verification of Google ID tokens (JWTs) issued by Google Identity Services
 * (One Tap). jose verifies the RS256 signature against Google's published
 * JWK set (fetched and cached from the JWKS URL) plus the standard aud/iss/
 * exp claims; we add the email checks and map the claims we need.
 * https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
 */

import {
  createRemoteJWKSet,
  type JWTHeaderParameters,
  type JWTPayload,
  jwtVerify,
} from "jose";

const JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
// Allow for client/server clock drift around exp/nbf.
const CLOCK_TOLERANCE_SECONDS = 60;

// Google issues ID tokens from both issuer spellings.
const ISSUERS = ["accounts.google.com", "https://accounts.google.com"];

export class GoogleIdTokenError extends Error {}

export interface GoogleIdTokenClaims {
  /** Stable Google account id. */
  sub: string;
  email: string;
  name?: string;
  picture?: string;
}

export interface VerifyGoogleIdTokenOptions {
  /** OAuth2 client id expected in the token's `aud` claim. */
  clientId: string;
  /**
   * Inject for tests; resolves the signing key for the token's header.
   * Defaults to jose's remote JWK set for Google.
   */
  getKey?: (header: JWTHeaderParameters) => Promise<CryptoKey>;
  /** Inject for tests; defaults to Date.now(). */
  now?: () => number;
}

let remoteJwks: ReturnType<typeof createRemoteJWKSet> | undefined;

function googleJwks(): ReturnType<typeof createRemoteJWKSet> {
  remoteJwks ??= createRemoteJWKSet(new URL(JWKS_URL));
  return remoteJwks;
}

export async function verifyGoogleIdToken(
  idToken: string,
  options: VerifyGoogleIdTokenOptions,
): Promise<GoogleIdTokenClaims> {
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(idToken, options.getKey ?? googleJwks(), {
      algorithms: ["RS256"],
      audience: options.clientId,
      issuer: ISSUERS,
      clockTolerance: CLOCK_TOLERANCE_SECONDS,
      currentDate: new Date(options.now?.() ?? Date.now()),
      requiredClaims: ["exp", "sub", "email"],
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new GoogleIdTokenError(message, { cause: error });
  }

  const { sub, email } = payload;
  if (typeof sub !== "string" || sub === "") {
    throw new GoogleIdTokenError("token has no subject");
  }
  if (typeof email !== "string" || email === "") {
    throw new GoogleIdTokenError("token has no email");
  }
  if (payload.email_verified === false) {
    throw new GoogleIdTokenError("token email is not verified");
  }

  return {
    sub,
    email,
    name:
      typeof payload.name === "string" && payload.name !== ""
        ? payload.name
        : undefined,
    picture:
      typeof payload.picture === "string" && payload.picture !== ""
        ? payload.picture
        : undefined,
  };
}
