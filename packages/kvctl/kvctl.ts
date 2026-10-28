// KV management CLI for the Essayist web app, over a D1 database.
//
// Usage:
//   pnpm --filter @essayist/kvctl kvctl <command> [args...] [--target <id>]
//
// The remote target reads CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID
// and CLOUDFLARE_API_TOKEN in .env (loaded via --env-file=../../.env by the
// kvctl script); --target overrides the database id. --local instead uses
// the vite dev server's D1 state. Run the script with --help for usage.

import { Command } from "@cliffy/command";

import { explore } from "#/commands/explore.ts";
import { grantRole } from "#/commands/grant-role.ts";
import { listUsers } from "#/commands/list-users.ts";
import { seedConfig } from "#/commands/seed-config.ts";
import { seedDemo } from "#/commands/seed-demo.ts";
import { trace } from "#/commands/trace.ts";
import { wipe } from "#/commands/wipe.ts";

await new Command()
  .name("kvctl")
  .description("KV management CLI for the Essayist web app.")
  .option(
    "-t, --target <target:string>",
    "Override the D1 database id; defaults to CLOUDFLARE_D1_DATABASE_ID from .env.",
    { global: true },
  )
  .option("--local", "Use the vite dev server's D1 state instead of the remote database.", {
    global: true,
  })
  .command("wipe", wipe)
  .command("explore", explore)
  .command("trace", trace)
  .command("grant-role", grantRole)
  .command("list-users", listUsers)
  .command("seed-config", seedConfig)
  .command("seed-demo", seedDemo)
  .parse(process.argv.slice(2));
