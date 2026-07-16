// Wipe all keys in a Deno KV instance.
//
// Usage:
//   deno task kv:wipe                                     # wipe local dev db (./local-kv.sqlite3)
//   deno task kv:wipe "https://api.deno.com/v2/databases/<id>/connect"
//
// For a remote instance, set DENO_KV_ACCESS_TOKEN=ddo_... in your environment.

const target = Deno.args[0] ?? "./local-kv.sqlite3";

const kv = await Deno.openKv(target);
let count = 0;
for await (const entry of kv.list({ prefix: [] })) {
  await kv.delete(entry.key);
  count++;
}
console.log(`deleted ${count} keys`);
kv.close();
