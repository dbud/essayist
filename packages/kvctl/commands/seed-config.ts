// Parked during the multipass rework; the single-pass seed is in git
// history and returns as a multipass seed in the next commit.

import { Command } from "@cliffy/command";
import type { KvctlGlobals } from "@/globals.ts";

export const seedConfig = new Command<KvctlGlobals>()
  .description("Seed default review config.")
  .action(() => {
    console.log("seed-config is parked during the multipass rework");
  });
