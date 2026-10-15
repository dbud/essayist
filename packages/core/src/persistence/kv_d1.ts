/**
 * D1 implementation of the {@linkcode Persistence} service over the
 * `@effect/sql-d1` client: a `D1Database` binding in the worker, or a
 * compatible adapter (the tests use the SQLite shim in `testing/d1.ts`).
 * One kv table, encoded by the sibling `kv_d1_codec`.
 *
 * Batches run as one atomic D1 batch: a failed statement rolls the whole
 * batch back, and a batch with checks opens with an assertion statement
 * that fails on purpose when any check no longer holds.
 */

import type * as D1Client from "@effect/sql-d1/D1Client";
import { Effect, Layer, Option, Result, Schema } from "effect";
import { SqlSchema } from "effect/sql";
import {
  decodeValue,
  encodeValue,
  keyRange,
  packKey,
  unpackKey,
} from "./kv_d1_codec.ts";
import {
  type BatchOptions,
  ConcurrentModificationError,
  type Entry,
  type Key,
  type ListOptions,
  type ListResult,
  type ReadOptions,
  type WriteOp,
} from "./mod.ts";
import { Persistence, PersistenceError } from "./service.ts";

/** The kv table schema; apply with `wrangler d1 execute --file`. */
export const KV_D1_SCHEMA = `CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  version INTEGER NOT NULL
) WITHOUT ROWID`;

/** A stored row: the encoded key and value texts, plus the version
 * counter. */
const RowSchema = Schema.Struct({
  key: Schema.String,
  value: Schema.String,
  version: Schema.Int,
});
type Row = typeof RowSchema.Type;

const rowEntry = <T>(row: Row): Entry<T> => ({
  key: unpackKey(row.key),
  value: decodeValue<T>(row.value),
  versionstamp: String(row.version),
});

const backendFault = (cause: unknown) => new PersistenceError({ cause });

/** A versionstamp check for one key, as absence or an exact stamp. It
 * carries its own parens: `and` only wraps two or more clauses, and a bare
 * `NOT <clause> = 0` would bind the wrong way. */
const guardClause = (
  client: D1Client.D1Client,
  check: { key: Key; versionstamp: string | null },
) =>
  check.versionstamp === null
    ? client`((SELECT count(*) FROM kv WHERE key = ${packKey(check.key)}) = 0)`
    : client`((SELECT version FROM kv WHERE key = ${packKey(
        check.key,
      )}) = ${Number(check.versionstamp)})`;

/** The statement that opens a checked batch: nothing inserts when every
 * check holds, and a NOT NULL violation on kv.key fails and rolls back
 * the whole batch when any check no longer holds. */
const assertionFor = (
  client: D1Client.D1Client,
  checks: NonNullable<BatchOptions["checks"]>,
) =>
  client`INSERT INTO kv (key, value, version) SELECT NULL, NULL, NULL WHERE NOT ${client.and(
    checks.map((check) => guardClause(client, check)),
  )}`;

const setsInsertFor = (
  client: D1Client.D1Client,
  sets: ReadonlyArray<{ key: Key; value: unknown }>,
) =>
  client`INSERT INTO kv ${client.insert(
    sets.map((op) => ({
      key: packKey(op.key),
      value: encodeValue(op.value),
      version: 1,
    })),
  )} ON CONFLICT (key) DO UPDATE SET value = excluded.value, version = kv.version + 1`;

const deletesFor = (client: D1Client.D1Client, keys: ReadonlyArray<Key>) =>
  client`DELETE FROM kv WHERE key IN ${client.in(keys.map(packKey))}`;

export function layerKvD1(client: D1Client.D1Client): Layer.Layer<Persistence> {
  // D1 reads are always strong; the consistency option is ignored.

  const byKey = (packed: string) =>
    client`SELECT key, value, version FROM kv WHERE key = ${packed}`;
  const byKeys = (packed: ReadonlyArray<string>) =>
    client`SELECT key, value, version FROM kv WHERE key IN ${client.in(packed)}`;

  const findEntryRow = SqlSchema.findOneOption({
    Request: Schema.String,
    Result: RowSchema,
    execute: byKey,
  });
  const findRows = SqlSchema.findAll({
    Request: Schema.Array(Schema.String),
    Result: RowSchema,
    execute: byKeys,
  });
  const verifyRows = SqlSchema.findAll({
    Request: Schema.Array(Schema.String),
    Result: Schema.Struct({ key: Schema.String, version: Schema.Int }),
    execute: byKeys,
  });

  const get = <T = unknown>(
    key: Key,
    _options?: ReadOptions,
  ): Effect.Effect<Entry<T> | undefined, PersistenceError> =>
    Effect.mapError(
      Effect.map(findEntryRow(packKey(key)), (option) =>
        Option.isNone(option) ? undefined : rowEntry<T>(option.value),
      ),
      backendFault,
    );

  const getMany = <T = unknown>(
    keys: Key[],
    _options?: ReadOptions,
  ): Effect.Effect<Array<Entry<T> | undefined>, PersistenceError> => {
    if (keys.length === 0) {
      return Effect.succeed<Array<Entry<T> | undefined>>([]);
    }
    return Effect.mapError(
      Effect.map(findRows(keys.map(packKey)), (rows) => {
        const byText = new Map(rows.map((row) => [row.key, row]));
        const entryOf = (key: Key): Entry<T> | undefined => {
          const row = byText.get(packKey(key));
          return row === undefined ? undefined : rowEntry<T>(row);
        };
        return keys.map(entryOf);
      }),
      backendFault,
    );
  };

  const list = <T = unknown>(
    prefix: Key,
    options?: ListOptions,
  ): Effect.Effect<ListResult<T>, PersistenceError> =>
    Effect.suspend(() => {
      const range = keyRange(prefix);
      const { limit, cursor, reverse } = options ?? {};
      const where = [
        client`key >= ${range.begin}`,
        ...(range.end === undefined ? [] : [client`key < ${range.end}`]),
        ...(cursor === undefined
          ? []
          : [
              reverse === true
                ? client`key < ${cursor}`
                : client`key > ${cursor}`,
            ]),
      ];
      // One extra row proves whether a next page exists.
      const page =
        limit === undefined ? client.literal("") : client`LIMIT ${limit + 1}`;
      const selectPage = SqlSchema.findAll({
        Request: Schema.Void,
        Result: RowSchema,
        execute: () =>
          client`SELECT key, value, version FROM kv WHERE ${client.join(
            " AND ",
            false,
          )(where)} ${client.literal(
            reverse === true ? "ORDER BY key DESC" : "ORDER BY key ASC",
          )} ${page}`,
      });
      return Effect.mapError(
        Effect.map(selectPage(), (rows) => {
          if (limit !== undefined && rows.length > limit) {
            const first = rows.slice(0, limit);
            const last = first[limit - 1];
            return {
              entries: first.map((row) => rowEntry<T>(row)),
              cursor: last === undefined ? undefined : last.key,
            };
          }
          return {
            entries: rows.map((row) => rowEntry<T>(row)),
            cursor: undefined,
          };
        }),
        backendFault,
      );
    });

  const batch = (
    ops: WriteOp[],
    options?: BatchOptions,
  ): Effect.Effect<void, PersistenceError | ConcurrentModificationError> =>
    Effect.gen(function* () {
      const checks = options?.checks ?? [];
      const sets = ops.flatMap((op) =>
        op.type === "set" ? [{ key: [...op.key], value: op.value }] : [],
      );
      const deletes = ops.flatMap((op) =>
        op.type === "delete" ? [[...op.key]] : [],
      );
      if (checks.length + sets.length + deletes.length === 0) return;
      const statements = [
        ...(checks.length === 0 ? [] : [assertionFor(client, checks)]),
        ...(sets.length === 0 ? [] : [setsInsertFor(client, sets)]),
        ...(deletes.length === 0 ? [] : [deletesFor(client, deletes)]),
      ];
      const outcome = yield* Effect.result(client.batch(statements));
      if (Result.isSuccess(outcome)) return;
      if (checks.length === 0) {
        // No checks: any failure is a backend fault.
        return yield* Effect.fail(backendFault(outcome.failure));
      }
      // The batch rolled back whole; re-read the checked keys to tell a
      // concurrent modification from a backend fault.
      const state = yield* Effect.result(
        verifyRows(checks.map((check) => packKey(check.key))),
      );
      const failing = Result.isSuccess(state)
        ? checks.find((check) => {
            const found = state.success.find(
              (row) => row.key === packKey(check.key),
            );
            return check.versionstamp === null
              ? found !== undefined
              : found === undefined ||
                  found.version !== Number(check.versionstamp);
          })
        : undefined;
      return yield* Effect.fail(
        failing === undefined
          ? backendFault(outcome.failure)
          : new ConcurrentModificationError({ key: [...failing.key] }),
      );
    });

  return Layer.effect(
    Persistence,
    Effect.sync(() =>
      Persistence.of({
        get,
        getMany,
        list,
        batch,
        set: (key: Key, value: unknown) => batch([{ type: "set", key, value }]),
        delete: (key: Key) => batch([{ type: "delete", key }]),
      }),
    ),
  );
}
