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
  ConfigStore,
  KvAdapter,
  USER_ROLES,
  type User,
  WorkspaceStore,
} from "@essayist/core";

const ROLE = new EnumType([...USER_ROLES]);

interface KvCtx {
  kv: Deno.Kv;
  store: WorkspaceStore;
  config: ConfigStore;
}

async function withKv<T>(
  target: string | undefined,
  fn: (ctx: KvCtx) => Promise<T>,
): Promise<T> {
  const resolved = target ?? Deno.env.get("REMOTE_URL") ?? "./local-kv.sqlite3";
  const kv = await Deno.openKv(resolved);
  const adapter = new KvAdapter(kv);
  try {
    return await fn({
      kv,
      store: new WorkspaceStore(adapter),
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
      console.error(`(${n} entries)`);
    }),
  )
  .command("grant-role", "Set a user's site-wide role.")
  .type("role", ROLE)
  .arguments("<emailOrId:string> <role:role>")
  .action(({ target }, emailOrId: string, role: "admin" | "writer") =>
    withKv(target, async ({ store }) => {
      let user = await store.getUserByEmail(emailOrId);
      if (!user && /^[0-9a-f-]{36}$/i.test(emailOrId))
        user = await store.getUser(emailOrId);
      if (!user) {
        console.error(`no user matching "${emailOrId}"`);
        Deno.exit(1);
      }
      const updated = await store.setUserRole(user.id, role);
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
        },
        {
          id: "evidence",
          label: "evidence",
          description: "Evidence and support",
        },
        {
          id: "structure",
          label: "structure",
          description: "Organization and flow",
        },
        { id: "tone", label: "tone", description: "Voice, tone, and register" },
        {
          id: "grammar",
          label: "grammar",
          description: "Grammar, mechanics, usage",
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
  .parse(Deno.args);
