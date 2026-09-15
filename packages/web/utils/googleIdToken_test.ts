import { assertEquals, assertRejects } from "@std/assert";
import { encodeBase64Url } from "@std/encoding/base64url";
import type { JWTHeaderParameters } from "jose";
import {
  GoogleIdTokenError,
  verifyGoogleIdToken,
} from "@/utils/googleIdToken.ts";

const CLIENT_ID = "test-client-id";
const NOW = 1_700_000_000_000;

const keyPair = await crypto.subtle.generateKey(
  {
    name: "RSASSA-PKCS1-v1_5",
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: "SHA-256",
  },
  true,
  ["sign", "verify"],
);
const publicJwk = {
  ...(await crypto.subtle.exportKey("jwk", keyPair.publicKey)),
  kid: "test-key",
};
const publicKey = await crypto.subtle.importKey(
  "jwk",
  publicJwk,
  { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
  false,
  ["verify"],
);

// Mimics jose's remote JWKS lookup: reject unknown kids, serve the test key.
const getKey = (header: JWTHeaderParameters): Promise<CryptoKey> => {
  if (header.kid !== "test-key") {
    return Promise.reject(new GoogleIdTokenError("unknown token key id"));
  }
  return Promise.resolve(publicKey);
};

const encodeBase64UrlJson = (value: unknown) =>
  encodeBase64Url(new TextEncoder().encode(JSON.stringify(value)));

async function signIdToken(
  payload: Record<string, unknown>,
  kid = "test-key",
): Promise<string> {
  const signedPart = `${encodeBase64UrlJson({ alg: "RS256", kid })}.${encodeBase64UrlJson(payload)}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    keyPair.privateKey,
    new TextEncoder().encode(signedPart),
  );
  return `${signedPart}.${encodeBase64Url(new Uint8Array(signature))}`;
}

function claims(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    iss: "https://accounts.google.com",
    aud: CLIENT_ID,
    sub: "1234567890",
    email: "dima@example.com",
    email_verified: true,
    name: "Dima",
    picture: "https://example.com/dima.png",
    iat: NOW / 1000,
    exp: NOW / 1000 + 300,
    ...overrides,
  };
}

async function verify(payload: Record<string, unknown>) {
  const idToken = await signIdToken(payload);
  return await verifyGoogleIdToken(idToken, {
    clientId: CLIENT_ID,
    getKey,
    now: () => NOW,
  });
}

Deno.test("verifyGoogleIdToken -- accepts a valid token", async () => {
  assertEquals(await verify(claims()), {
    sub: "1234567890",
    email: "dima@example.com",
    name: "Dima",
    picture: "https://example.com/dima.png",
  });
});

Deno.test("verifyGoogleIdToken -- accepts the bare issuer spelling", async () => {
  const result = await verify(claims({ iss: "accounts.google.com" }));
  assertEquals(result.email, "dima@example.com");
});

Deno.test("verifyGoogleIdToken -- omits empty name and picture", async () => {
  const result = await verify(claims({ name: "", picture: "" }));
  assertEquals(result.name, undefined);
  assertEquals(result.picture, undefined);
});

Deno.test("verifyGoogleIdToken -- rejects a foreign audience", async () => {
  await assertRejects(
    () => verify(claims({ aud: "someone-elses-client" })),
    GoogleIdTokenError,
    "aud",
  );
});

Deno.test("verifyGoogleIdToken -- rejects an expired token", async () => {
  await assertRejects(
    () => verify(claims({ exp: NOW / 1000 - 120 })),
    GoogleIdTokenError,
    "exp",
  );
});

Deno.test("verifyGoogleIdToken -- rejects a not-yet-valid token", async () => {
  await assertRejects(
    () => verify(claims({ nbf: NOW / 1000 + 120 })),
    GoogleIdTokenError,
    "nbf",
  );
});

Deno.test("verifyGoogleIdToken -- rejects an unknown issuer", async () => {
  await assertRejects(
    () => verify(claims({ iss: "https://evil.example" })),
    GoogleIdTokenError,
    "iss",
  );
});

Deno.test("verifyGoogleIdToken -- rejects an unverified email", async () => {
  await assertRejects(
    () => verify(claims({ email_verified: false })),
    GoogleIdTokenError,
    "not verified",
  );
});

Deno.test("verifyGoogleIdToken -- rejects a tampered signature", async () => {
  const idToken = await signIdToken(claims());
  const [header, payload, signature] = idToken.split(".");
  const tampered = `A${signature.slice(1)}`;
  await assertRejects(
    () =>
      verifyGoogleIdToken(`${header}.${payload}.${tampered}`, {
        clientId: CLIENT_ID,
        getKey,
        now: () => NOW,
      }),
    GoogleIdTokenError,
    "signature",
  );
});

Deno.test("verifyGoogleIdToken -- rejects an unknown key id", async () => {
  const idToken = await signIdToken(claims(), "rotated-key");
  await assertRejects(
    () =>
      verifyGoogleIdToken(idToken, {
        clientId: CLIENT_ID,
        getKey,
        now: () => NOW,
      }),
    GoogleIdTokenError,
    "key id",
  );
});

Deno.test("verifyGoogleIdToken -- rejects a malformed token", async () => {
  await assertRejects(
    () =>
      verifyGoogleIdToken("not-a-jwt", {
        clientId: CLIENT_ID,
        getKey,
        now: () => NOW,
      }),
    GoogleIdTokenError,
    "Compact JWS",
  );
});
