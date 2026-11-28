// Database management CLI for the Essayist web app.
//
// Usage: pnpm --filter @essayist/dbctl dbctl <command> [args...] [--remote]
//
// The commands work on the D1 state of the vite dev server. --remote instead reaches the deployed
// database with CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN from .env (loaded via --env-
// file=../../.env by the dbctl script). Run the script with --help for usage.

import { Command } from "@cliffy/command";

import { grantRole } from "#/commands/grant-role.ts";
import { listUsers } from "#/commands/list-users.ts";
import { runs } from "#/commands/runs.ts";
import { seed } from "#/commands/seed.ts";
import { sql } from "#/commands/sql.ts";
import { trace } from "#/commands/trace.ts";
import { wipeRuns } from "#/commands/wipe-runs.ts";

await new Command()
  .name("dbctl")
  .description("Database management CLI for the Essayist web app.")
  .option("--remote", "Use the deployed database instead of the D1 state of the vite dev server.", {
    global: true,
  })
  .command("wipe-runs", wipeRuns)
  .command("runs", runs)
  .command("sql", sql)
  .command("trace", trace)
  .command("grant-role", grantRole)
  .command("list-users", listUsers)
  .command("seed", seed)
  .parse(process.argv.slice(2));
