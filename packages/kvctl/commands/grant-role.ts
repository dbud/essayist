import { Command, EnumType } from "@cliffy/command";
import { USER_ROLES } from "@essayist/core";
import { withKv } from "@/kv.ts";

const ROLE = new EnumType([...USER_ROLES]);

export const grantRole = new Command<{ target?: string }>()
  .description("Set a user's site-wide role.")
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
  );
