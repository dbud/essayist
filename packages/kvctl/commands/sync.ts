import { Command, EnumType } from "@cliffy/command";
import { ConfigStore, KvAdapter } from "@essayist/core";
import {
  FAMILIES,
  FAMILY_ORDER,
  type FamilyKey,
  type SyncCtx,
  warnBrokenRefs,
} from "@/families.ts";
import type { KvctlGlobals } from "@/globals.ts";
import { CATEGORIES_EPOCH, LOCAL_KV, resolveTarget } from "@/kv.ts";

const FAMILY = new EnumType([...FAMILY_ORDER, "all"]);

export const sync = new Command<KvctlGlobals>()
  .description(
    "Copy config entities from a source KV into the target. Non-destructive unless --prune. Review passes are checked for dangling references after syncing.",
  )
  .type("family", FAMILY)
  .arguments("<family:family>")
  .option(
    "--from <kv:string>",
    "Source KV path or URL. Defaults to the local playground KV.",
    { default: LOCAL_KV },
  )
  .option("--prune", "Also delete target entries missing from the source.", {
    default: false,
  })
  .action(async ({ target, local, from, prune }, family) => {
    const sourcePath = from ?? LOCAL_KV;
    const targetPath = resolveTarget({ target, local });
    if (sourcePath === targetPath) {
      console.error(
        `source and target are both ${sourcePath}; nothing to sync`,
      );
      Deno.exit(1);
    }
    const keys: FamilyKey[] =
      family === "all" ? FAMILY_ORDER : [family as FamilyKey];
    const sourceKv = await Deno.openKv(sourcePath);
    const targetKv = await Deno.openKv(targetPath);
    try {
      const ctx: SyncCtx = {
        source: new ConfigStore(new KvAdapter(sourceKv)),
        target: new ConfigStore(new KvAdapter(targetKv)),
        kv: targetKv,
      };
      for (const key of keys) {
        const { line, changed } = await FAMILIES[key](ctx, prune);
        console.log(line);
        if (key === "categories" && changed) {
          // A running instance watches this key; bump it so the new
          // categories are picked up immediately.
          await ctx.kv.set(CATEGORIES_EPOCH, Date.now());
        }
      }
      if (keys.includes("passes") || prune) await warnBrokenRefs(ctx);
    } finally {
      sourceKv.close();
      targetKv.close();
    }
  });
