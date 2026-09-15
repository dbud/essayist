// KV management CLI for the Essayist web app.
//
// Usage:
//   deno task kvctl <command> [args...] [--target <url|path>]
//
// For a remote instance, set DENO_KV_ACCESS_TOKEN=ddo_... in .env (loaded via
// --env-file=.env by the kvctl task). Optionally set REMOTE_URL in .env to use
// it as the default target when --target is omitted. Run `deno task kvctl help`
// for full usage.

import { Command, EnumType } from "@cliffy/command";
import {
  CategorySchema,
  ConfigStore,
  KvAdapter,
  type ModelPool,
  ModelPoolSchema,
  PromptSchema,
  ReviewPassSchema,
  USER_ROLES,
  type User,
  WorkspaceStore,
} from "@essayist/core";
import { pluralize } from "@/utils/format.ts";

// The local playground KV: default sync source, and the default target when
// no remote is configured.
const LOCAL_KV = "./local-kv.sqlite3";

// The categories cache on a running instance watches this key; a bump makes
// every isolate drop its cache instead of waiting out the TTL.
const CATEGORIES_EPOCH: Deno.KvKey = ["cache_epoch", "categories"];

const ROLE = new EnumType([...USER_ROLES]);
const FAMILY = new EnumType([
  "pools",
  "prompts",
  "categories",
  "passes",
  "all",
]);

type FamilyKey = "pools" | "prompts" | "categories" | "passes";
const FAMILY_ORDER: FamilyKey[] = ["pools", "prompts", "categories", "passes"];

interface KvCtx {
  kv: Deno.Kv;
  workspaceStore: WorkspaceStore;
  config: ConfigStore;
}

function resolveTarget(target: string | undefined): string {
  return target ?? Deno.env.get("REMOTE_URL") ?? LOCAL_KV;
}

async function withKv<T>(
  target: string | undefined,
  fn: (ctx: KvCtx) => Promise<T>,
): Promise<T> {
  const kv = await Deno.openKv(resolveTarget(target));
  const adapter = new KvAdapter(kv);
  try {
    return await fn({
      kv,
      workspaceStore: new WorkspaceStore(adapter),
      config: new ConfigStore(adapter),
    });
  } finally {
    kv.close();
  }
}

// colored inspect on a TTY; plain JSON when stdout is piped, one document
// per entry, so jq can parse the stream
function printEntry(entry: Deno.KvEntry<unknown>): void {
  const tuple = [entry.key, entry.value];
  const body = Deno.stdout.isTerminal()
    ? Deno.inspect(tuple, {
        colors: !Deno.env.has("NO_COLOR"),
        sorted: true,
        compact: true,
      })
    : JSON.stringify(tuple, null, 2);
  console.log(`${body}\n`);
}

/** Validate one entity against a zod schema; returns an error message or
 *  null. Structural so kvctl does not need a zod dependency of its own. */
function check<T>(
  schema: {
    safeParse(value: unknown):
      | { success: true; data: T }
      | {
          success: false;
          error: { issues: { message: string; path: PropertyKey[] }[] };
        };
  },
  label: string,
): (value: unknown) => string | null {
  return (value) => {
    const result = schema.safeParse(value);
    if (result.success) return null;
    const detail = result.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    return `${label}: ${detail}`;
  };
}

interface SyncCtx {
  source: ConfigStore;
  target: ConfigStore;
  /** Target KV handle, for cache epoch bumps. */
  kv: Deno.Kv;
}

interface CopyArgs<T> {
  name: string;
  source: T[];
  target: T[];
  keyOf: (entity: T) => string;
  check: (entity: T) => string | null;
  save: (entity: T) => Promise<void>;
  remove: (id: string) => Promise<void>;
  prune: boolean;
  /** Return a reason to keep a target-only id instead of pruning it. */
  keep?: (id: string) => string | null;
}

/** Upsert source entries into the target by key, skipping byte-identical
 *  entries. Prune deletes target entries missing from the source, except
 *  those `keep` protects. */
async function copyEntries<T>({
  name,
  source,
  target,
  keyOf,
  check: validate,
  save,
  remove,
  prune,
  keep,
}: CopyArgs<T>): Promise<{ line: string; changed: boolean }> {
  const issues = source.map(validate).filter((s): s is string => s !== null);
  if (issues.length > 0) {
    throw new Error(`invalid ${name} in source:\n  ${issues.join("\n  ")}`);
  }
  const targetJson = new Map(
    target.map((entity) => [keyOf(entity), JSON.stringify(entity)] as const),
  );
  let added = 0;
  let updated = 0;
  let unchanged = 0;
  for (const entity of source) {
    const id = keyOf(entity);
    const json = JSON.stringify(entity);
    const prev = targetJson.get(id);
    if (prev === json) {
      unchanged++;
      continue;
    }
    await save(entity);
    if (prev === undefined) added++;
    else updated++;
  }
  let pruned = 0;
  const kept: string[] = [];
  if (prune) {
    const sourceIds = new Set(source.map(keyOf));
    for (const [id] of targetJson) {
      if (sourceIds.has(id)) continue;
      const reason = keep?.(id);
      if (reason) {
        kept.push(`${id} (${reason})`);
        continue;
      }
      await remove(id);
      pruned++;
    }
  }
  const parts = [
    `${name}: ${source.length} in source, ${added} added, ${updated} updated, ${unchanged} unchanged`,
  ];
  if (pruned > 0) parts.push(`pruned ${pruned}`);
  if (kept.length > 0) parts.push(`kept ${kept.join(", ")}`);
  return { line: parts.join("; "), changed: added + updated + pruned > 0 };
}

const FAMILIES: Record<
  FamilyKey,
  (ctx: SyncCtx, prune: boolean) => Promise<{ line: string; changed: boolean }>
> = {
  async pools(ctx, prune) {
    return copyEntries({
      name: "model pools",
      source: await ctx.source.listModelPools(),
      target: await ctx.target.listModelPools(),
      keyOf: (e) => e.id,
      check: check(ModelPoolSchema, "model pool"),
      save: (e: ModelPool) => ctx.target.saveModelPool(e),
      remove: (id) => ctx.target.deleteModelPool(id),
      prune,
    });
  },
  async prompts(ctx, prune) {
    return copyEntries({
      name: "prompts",
      source: await ctx.source.listPrompts(),
      target: await ctx.target.listPrompts(),
      keyOf: (e) => e.key,
      check: check(PromptSchema, "prompt"),
      save: (e) => ctx.target.savePrompt(e),
      remove: (id) => ctx.target.deletePrompt(id),
      prune,
    });
  },
  async categories(ctx, prune) {
    return copyEntries({
      name: "categories",
      source: await ctx.source.listCategories(),
      target: await ctx.target.listCategories(),
      keyOf: (e) => e.id,
      check: check(CategorySchema, "category"),
      save: (e) => ctx.target.saveCategory(e),
      remove: (id) => ctx.target.deleteCategory(id),
      prune,
    });
  },
  async passes(ctx, prune) {
    // Keep the pass currently active on the target even when pruning.
    const activeId = await ctx.target.getActiveReviewPassId();
    return copyEntries({
      name: "review passes",
      source: await ctx.source.listReviewPasses(),
      target: await ctx.target.listReviewPasses(),
      keyOf: (e) => e.id,
      check: check(ReviewPassSchema, "review pass"),
      save: (e) => ctx.target.saveReviewPass(e),
      remove: (id) => ctx.target.deleteReviewPass(id),
      prune,
      keep: (id) => (id === activeId ? "active on target" : null),
    });
  },
};

/** Warn about target review passes referencing entities the target lacks. */
async function warnBrokenRefs(ctx: SyncCtx): Promise<void> {
  const [pools, prompts, categories, passes] = await Promise.all([
    ctx.target.listModelPools(),
    ctx.target.listPrompts(),
    ctx.target.listCategories(),
    ctx.target.listReviewPasses(),
  ]);
  const poolIds = new Set(pools.map((p) => p.id));
  const promptKeys = new Set(prompts.map((p) => p.key));
  const categoryIds = new Set(categories.map((c) => c.id));
  for (const pass of passes) {
    const missing: string[] = [];
    if (!poolIds.has(pass.modelPoolId)) {
      missing.push(`model pool "${pass.modelPoolId}"`);
    }
    for (const key of [
      pass.systemPromptKey,
      pass.directivePromptKey,
      ...(pass.instructionsPromptKey ? [pass.instructionsPromptKey] : []),
    ]) {
      if (!promptKeys.has(key)) missing.push(`prompt "${key}"`);
    }
    for (const id of pass.allowedCategoryIds) {
      if (!categoryIds.has(id)) missing.push(`category "${id}"`);
    }
    if (missing.length > 0) {
      console.error(
        `warning: review pass "${pass.id}" references missing ${missing.join(", ")}`,
      );
    }
  }
}

await new Command()
  .name("kvctl")
  .description("KV management CLI for the Essayist web app.")
  .option(
    "-t, --target <target:string>",
    "KV target (path or URL). Defaults to REMOTE_URL from .env, then local SQLite.",
    { global: true },
  )
  .command("wipe", "Delete every key.")
  .action(({ target }) =>
    withKv(target, async ({ kv }) => {
      let n = 0;
      for await (const entry of kv.list({ prefix: [] })) {
        await kv.delete(entry.key);
        n++;
      }
      console.log(`deleted ${n} keys`);
    }),
  )
  .command("explore", "List keys, optionally under a tuple prefix.")
  .arguments("[prefix...:string]")
  .action(({ target }, ...prefix: string[]) =>
    withKv(target, async ({ kv }) => {
      let n = 0;
      for await (const entry of kv.list({ prefix })) {
        n++;
        printEntry(entry);
      }
      // footer goes to stderr so piped stdout stays pure JSON
      console.error(`(${n} ${pluralize(n, "entry", "entries")})`);
    }),
  )
  .command("grant-role", "Set a user's site-wide role.")
  .type("role", ROLE)
  .arguments("<emailOrId:string> <role:role>")
  .action(({ target }, emailOrId: string, role: "admin" | "writer") =>
    withKv(target, async ({ workspaceStore }) => {
      let user = await workspaceStore.getUserByEmail(emailOrId);
      if (!user && /^[0-9a-f-]{36}$/i.test(emailOrId))
        user = await workspaceStore.getUser(emailOrId);
      if (!user) {
        console.error(`no user matching "${emailOrId}"`);
        Deno.exit(1);
      }
      const updated = await workspaceStore.setUserRole(user.id, role);
      console.log(`granted ${role} to ${updated?.email} (${updated?.id})`);
    }),
  )
  .command("list-users", "List users.")
  .action(({ target }) =>
    withKv(target, async ({ kv }) => {
      let n = 0;
      for await (const entry of kv.list<User>({ prefix: ["users"] })) {
        const u = entry.value;
        console.log(`${u.id}  ${u.email}  role=${u.role ?? "writer"}`);
        n++;
      }
      console.log(`(${n} users)`);
    }),
  )
  .command("seed-config", "Seed default review config.")
  .action(({ target }) =>
    withKv(target, async ({ config }) => {
      const poolId = "free-pool";
      await config.saveModelPool({
        id: poolId,
        name: "Free pool",
        models: [
          "poolside/laguna-s-2.1:free",
          "nvidia/nemotron-3.5-lightning:free",
        ],
      });

      // Default prompts are generic placeholders.
      const systemPromptKey = "system.reviewer";
      const instructionsPromptKey = "instructions.mark";
      const directivePromptKey = "directive.review";
      const prompts = [
        {
          key: systemPromptKey,
          body: "You are an experienced editor and writing teacher. You review the user's literary work and leave constructive, specific annotations. You never rewrite the work; you only read and mark it.",
        },
        {
          key: instructionsPromptKey,
          body: "Read the relevant files, then place all annotations for a file in a single mark call, passing every mark in the marks array. Each mark must use one of the allowed labels and a concise, actionable comment.",
        },
        {
          key: directivePromptKey,
          body: 'Review the file "{{file}}". Read it, then mark issues using the allowed labels.',
        },
      ];
      for (const p of prompts) await config.savePrompt(p);

      const categories = [
        {
          id: "thesis",
          label: "thesis",
          description: "Thesis and argument clarity",
          color: "oklch(65% 0.4 260)",
        },
        {
          id: "evidence",
          label: "evidence",
          description: "Evidence and support",
          color: "oklch(65% 0.4 130)",
        },
        {
          id: "structure",
          label: "structure",
          description: "Organization and flow",
          color: "oklch(65% 0.4 90)",
        },
        {
          id: "tone",
          label: "tone",
          description: "Voice, tone, and register",
          color: "oklch(65% 0.4 300)",
        },
        {
          id: "grammar",
          label: "grammar",
          description: "Grammar, mechanics, usage",
          color: "oklch(65% 0.4 355)",
        },
      ] as const;
      for (const c of categories) await config.saveCategory(c);

      const reviewPassId = "essay-review";
      await config.saveReviewPass({
        id: reviewPassId,
        name: "Essay review",
        modelPoolId: poolId,
        systemPromptKey,
        directivePromptKey,
        instructionsPromptKey,
        enabledTools: ["read_file", "list_files", "grep", "mark"],
        allowedCategoryIds: categories.map((c) => c.id),
        maxRounds: 5,
      });
      await config.setActiveReviewPass(reviewPassId);

      console.log(
        `seeded default config: model pool '${poolId}', ${prompts.length} prompts, ${categories.length} categories, review pass '${reviewPassId}' (active)`,
      );
    }),
  )
  .command(
    "sync",
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
  .action(async ({ target, from, prune }, family) => {
    const sourcePath = from ?? LOCAL_KV;
    const targetPath = resolveTarget(target);
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
  })
  .parse(Deno.args);
