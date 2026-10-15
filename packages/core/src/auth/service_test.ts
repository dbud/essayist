/**
 * The AuthStore D1 layer over the `node:sqlite` shim in place of the
 * worker's `D1Database` binding, with a fake Clock for deterministic
 * expiry and TTL. The layer applies its own tables, so the schema
 * creation runs under test too.
 */

import { DatabaseSync } from "node:sqlite";
import * as D1Client from "@effect/sql-d1/D1Client";
import { Clock, Effect } from "effect";
import * as Reactivity from "effect/reactivity/Reactivity";
import { expect, test } from "vitest";
import { layerAuthD1 } from "#/persistence/auth_d1.ts";
import { d1SqliteShim } from "#/persistence/kv_d1_sqlite.ts";
import { AuthStore, type Interface } from "./service.ts";
import type { SessionTokens } from "./types.ts";

const BASE_TIME = 1_700_000_000_000;
const DAY_MS = 24 * 60 * 60 * 1000;

const tokens: SessionTokens = {
  accessToken: "at",
  tokenType: "Bearer",
  expiresIn: 3600,
  refreshToken: "rt",
  expiresAt: 12345,
};

// Each test gets its own database and a fake Clock set to BASE_TIME.
const makeHarness = () => {
  let now = BASE_TIME;
  const tick = (ms: number) => {
    now += ms;
  };
  const clock: Clock.Clock = {
    currentTimeMillisUnsafe: () => now,
    currentTimeMillis: Effect.sync(() => now),
    currentTimeNanosUnsafe: () => BigInt(now) * 1_000_000n,
    currentTimeNanos: Effect.sync(() => BigInt(now) * 1_000_000n),
    monotonicTimeNanosUnsafe: () => BigInt(now),
    monotonicTimeNanos: Effect.sync(() => BigInt(now)),
    sleep: () => Effect.void,
  };
  const db = new DatabaseSync(":memory:");
  const run = (
    body: (test: {
      auth: Interface;
      tick: (ms: number) => void;
      db: DatabaseSync;
    }) => Effect.Effect<void, unknown>,
  ) =>
    Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* D1Client.make({ db: d1SqliteShim(db) });
        yield* Effect.provide(
          Effect.provideService(
            Effect.gen(function* () {
              const auth = yield* AuthStore;
              yield* body({ auth: auth, tick: tick, db: db });
            }),
            Clock.Clock,
            clock,
          ),
          layerAuthD1(client),
        );
      }).pipe(Effect.scoped, Effect.provide(Reactivity.layer)),
    ).finally(() => {
      db.close();
    });
  return { run: run };
};

test("create and read a session without tokens", async () => {
  await makeHarness().run((t) =>
    Effect.gen(function* () {
      yield* t.auth.createSession("s1", "user-1");
      const session = yield* t.auth.getSession("s1");
      expect(session).toEqual({
        id: "s1",
        userId: "user-1",
        tokens: undefined,
      });
      expect(yield* t.auth.getSession("missing")).toBeUndefined();
    }),
  );
});

test("tokens round trip", async () => {
  await makeHarness().run((t) =>
    Effect.gen(function* () {
      yield* t.auth.createSession("s1", "user-1", tokens);
      const session = yield* t.auth.getSession("s1");
      expect(session?.tokens).toEqual(tokens);
    }),
  );
});

test("update rewrites tokens and slides the TTL", async () => {
  await makeHarness().run((t) =>
    Effect.gen(function* () {
      yield* t.auth.createSession("s1", "user-1", tokens);
      t.tick(3_600_000);
      const refreshed = { ...tokens, accessToken: "at2" };
      yield* t.auth.updateSessionTokens("s1", refreshed);
      const session = yield* t.auth.getSession("s1");
      expect(session?.tokens).toEqual(refreshed);
      const row = t.db
        .prepare("SELECT expires_at FROM auth_session WHERE id = 's1'")
        .get() as { expires_at: number };
      expect(row.expires_at).toBe(BASE_TIME + 3_600_000 + 90 * DAY_MS);
    }),
  );
});

test("a session past expiry reads as missing", async () => {
  await makeHarness().run((t) =>
    Effect.gen(function* () {
      yield* t.auth.createSession("s1", "user-1", tokens);
      t.tick(90 * DAY_MS + 1);
      expect(yield* t.auth.getSession("s1")).toBeUndefined();
    }),
  );
});

test("delete session and refresh token upsert", async () => {
  await makeHarness().run((t) =>
    Effect.gen(function* () {
      expect(yield* t.auth.getRefreshToken("user-1")).toBeUndefined();
      yield* t.auth.setRefreshToken("user-1", "rt-old");
      expect(yield* t.auth.getRefreshToken("user-1")).toBe("rt-old");
      yield* t.auth.setRefreshToken("user-1", "rt-new");
      expect(yield* t.auth.getRefreshToken("user-1")).toBe("rt-new");

      yield* t.auth.createSession("s1", "user-1");
      yield* t.auth.deleteSession("s1");
      expect(yield* t.auth.getSession("s1")).toBeUndefined();

      // Updating the tokens of a deleted session changes nothing.
      yield* t.auth.updateSessionTokens("s1", tokens);
      expect(yield* t.auth.getSession("s1")).toBeUndefined();
    }),
  );
});
