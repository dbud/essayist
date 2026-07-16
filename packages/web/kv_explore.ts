// Explore a Deno KV instance: list keys (optionally under a prefix).
//
// Usage:
//   deno task kv:explore                                  # local dev db (./local-kv.sqlite3)
//   deno task kv:explore ./local-kv.sqlite3 users         # only the ["users", ...] subtree
//   deno task kv:explore "https://api.deno.com/v2/databases/<id>/connect"
//
// For a remote instance, set DENO_KV_ACCESS_TOKEN=ddo_... in .env (loaded
// automatically by the kv:explore task via --env-file=.env).

const target = Deno.args[0] ?? "./local-kv.sqlite3";
const prefix = Deno.args.slice(1);

function pretty(value: unknown) {
  return Deno.inspect(value, {
    colors: true,
    sorted: true,
    compact: true,
  });
}

const kv = await Deno.openKv(target);
let count = 0;
for await (const entry of kv.list({ prefix })) {
  count++;
  console.log(`${pretty([entry.key, entry.value])}\n`);
}
console.log(`(${count} entries)`);
kv.close();
