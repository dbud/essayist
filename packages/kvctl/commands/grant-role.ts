import { Command, EnumType } from "@cliffy/command";
import { USER_ROLES, Workspaces } from "@essayist/core";

import type { KvctlGlobals } from "#/globals.ts";
import { withStore } from "#/kv.ts";

const ROLE = new EnumType([...USER_ROLES]);

export const grantRole = new Command<KvctlGlobals>()
  .description("Set a user's site-wide role.")
  .type("role", ROLE)
  .arguments("<emailOrId:string> <role:role>")
  .action(({ target, local }, emailOrId: string, role: "admin" | "writer") =>
    withStore({ target, local }, async ({ runtime }) => {
      let user = await runtime.runPromise(
        Workspaces.use((store) => store.getUserByEmail(emailOrId)),
      );
      if (!user && /^[0-9a-f-]{36}$/i.test(emailOrId)) {
        user = await runtime.runPromise(Workspaces.use((store) => store.getUser(emailOrId)));
      }
      if (!user) {
        console.error(`no user matching "${emailOrId}"`);
        process.exit(1);
      }
      // A const alias keeps the narrowing inside the use() callback.
      const current = user;
      const updated = await runtime.runPromise(
        Workspaces.use((store) => store.setUserRole(current.id, role)),
      );
      console.log(`granted ${role} to ${updated?.email} (${updated?.id})`);
    }),
  );
