// coloured inspect on a TTY; plain JSON when stdout is piped, a single document per value, so jq
// can parse the stream

import { inspect } from "node:util";

/** The text of a value for stdout, followed by a blank line. */
export function pretty(value: unknown): string {
  const body = process.stdout.isTTY
    ? inspect(value, {
        colors: process.env.NO_COLOR === undefined,
        sorted: true,
        compact: true,
        depth: 12,
      })
    : JSON.stringify(value, null, 2);
  return `${body}\n`;
}
