// KV management CLI for the Essayist web app.
//
// Usage:
//   deno task kvctl <command> [args...] [--target <url|path>]
//
// For a remote instance, set DENO_KV_ACCESS_TOKEN=ddo_... in .env (loaded via
// --env-file=.env by the kvctl task). Optionally set REMOTE_URL in .env to use
// it as the default target when --target is omitted; pass --local to ignore
// REMOTE_URL and use the local playground KV. Run `deno task kvctl --help`
// for full usage.

import { Command } from "@cliffy/command";
import { explore } from "@/commands/explore.ts";
import { grantRole } from "@/commands/grant-role.ts";
import { listUsers } from "@/commands/list-users.ts";
import { seedConfig } from "@/commands/seed-config.ts";
import { sync } from "@/commands/sync.ts";
import { wipe } from "@/commands/wipe.ts";

await new Command()
  .name("kvctl")
  .description("KV management CLI for the Essayist web app.")
  .option(
    "-t, --target <target:string>",
    "KV target (path or URL). Defaults to REMOTE_URL from .env, then local SQLite.",
    { global: true },
  )
  .option("--local", "Use the local KV, overriding REMOTE_URL from .env.", {
    global: true,
  })
  .command("wipe", wipe)
  .command("explore", explore)
  .command("grant-role", grantRole)
  .command("list-users", listUsers)
  .command("seed-config", seedConfig)
  .command("sync", sync)
  .parse(Deno.args);
