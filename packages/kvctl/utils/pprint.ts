// colored inspect on a TTY; plain JSON when stdout is piped, one document
// per call, so jq can parse the stream
export function pprint<T>(value: T): void {
  const body = Deno.stdout.isTerminal()
    ? Deno.inspect(value, {
        colors: !Deno.env.has("NO_COLOR"),
        sorted: true,
        compact: true,
      })
    : JSON.stringify(value, null, 2);
  console.log(`${body}\n`);
}
