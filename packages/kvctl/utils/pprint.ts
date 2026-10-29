// colored inspect on a TTY; plain JSON when stdout is piped, a single document per call, so jq can
// parse the stream

import { inspect } from "node:util";

export function pprint(value: unknown): void {
  const body = process.stdout.isTTY
    ? inspect(value, {
        colors: process.env.NO_COLOR === undefined,
        sorted: true,
        compact: true,
        depth: 12,
      })
    : JSON.stringify(value, null, 2);
  console.log(`${body}\n`);
}
