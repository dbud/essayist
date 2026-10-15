/**
 * A `D1Database`-shaped adapter over the Cloudflare D1 REST API, for node
 * runtimes without a binding (kvctl). Single statements bind params
 * natively; a batch joins statements with `;` in one /query call, which is
 * all-or-nothing, and the REST API forbids params across statements, so a
 * batch carries its params inlined as literals. That is sound for this
 * table's params by construction: fdb-tuple hex keys, CBOR base64 values,
 * and version counters share no string metacharacters.
 */

import type {
  D1Database,
  D1PreparedStatement,
} from "@cloudflare/workers-types";

export interface D1RestConfig {
  readonly accountId: string;
  readonly databaseId: string;
  readonly apiToken: string;
}

interface HttpResult {
  readonly results?: Record<string, unknown>[];
}

interface AdapterStatement {
  readonly sql: string;
  readonly params: ReadonlyArray<unknown>;
}

export function d1RestDatabase(config: D1RestConfig): D1Database {
  const url = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/d1/database/${config.databaseId}/query`;

  const post = async (body: unknown): Promise<HttpResult[]> => {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.apiToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as {
      success?: boolean;
      errors?: Array<{ message?: string }>;
      result?: HttpResult[];
    };
    if (payload.success !== true || payload.result === undefined) {
      const detail = (payload.errors ?? [])
        .map((error) => error.message)
        .join("; ");
      throw new Error(`D1 REST query failed: ${detail}`);
    }
    return payload.result;
  };

  /** Inline one param at each `?` as a SQL literal. */
  const inline = (sql: string, params: ReadonlyArray<unknown>): string => {
    let cursor = 0;
    return sql.replace(/\?/g, () => {
      const param = params[cursor++];
      if (param === undefined) {
        throw new Error("a SQL placeholder has no param");
      }
      return param === null
        ? "NULL"
        : typeof param === "number"
          ? String(param)
          : `'${String(param)}'`;
    });
  };

  const statement = (sql: string, params: ReadonlyArray<unknown> = []) => ({
    sql,
    params,
    bind: (...next: ReadonlyArray<unknown>) => statement(sql, next),
    all: async () => {
      const result = await post({ sql, params });
      return { results: result[0]?.results ?? [] };
    },
    raw: async () => {
      const result = await post({ sql, params });
      return result[0]?.results?.map((row) => Object.values(row)) ?? [];
    },
  });

  return {
    prepare: (sql: string) => statement(sql),
    batch: async (statements: D1PreparedStatement[]) => {
      const joined = (statements as unknown as AdapterStatement[])
        .map((s) => inline(s.sql, s.params))
        .join(";\n");
      const result = await post({ sql: joined });
      return result.map((part) => ({ results: part.results ?? [] }));
    },
  } as unknown as D1Database;
}
