// KV management CLI for the Essayist web app, over a D1 database.
//
// Usage: pnpm --filter @essayist/kvctl kvctl <command> [args...] [--local]
//
// The deployed database is reached with CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN from .env
// (loaded via --env-file=../../.env by the kvctl script); --local instead uses the D1 state of the
// vite dev server. Run the script with --help for usage.

import { Command } from "@cliffy/command";

import { explore } from "#/commands/explore.ts";
import { grantRole } from "#/commands/grant-role.ts";
import { listUsers } from "#/commands/list-users.ts";
import { runs } from "#/commands/runs.ts";
import { seedConfig } from "#/commands/seed-config.ts";
import { seedDemo } from "#/commands/seed-demo.ts";
import { sql } from "#/commands/sql.ts";
import { trace } from "#/commands/trace.ts";
import { wipeRuns } from "#/commands/wipe-runs.ts";
import { wipe } from "#/commands/wipe.ts";

await new Command()
  .name("kvctl")
  .description("KV management CLI for the Essayist web app.")
  .option("--local", "Use the vite dev server's D1 state instead of the remote database.", {
    global: true,
  })
  .command("wipe", wipe)
  .command("wipe-runs", wipeRuns)
  .command("runs", runs)
  .command("sql", sql)
  .command("explore", explore)
  .command("trace", trace)
  .command("grant-role", grantRole)
  .command("list-users", listUsers)
  .command("seed-config", seedConfig)
  .command("seed-demo", seedDemo)
  .parse(process.argv.slice(2));
