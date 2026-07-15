import { LastOwnerError, type Role } from "@essayist/core";
import { define } from "@/define.ts";
import { store } from "@/store.ts";

export const handler = {
  // Any member can list members.
  GET: define.handlers(async (ctx) => {
    const members = await store.getMembers(ctx.state.workspaceId);
    return Response.json(members);
  }),

  // Only owners can add/update members.
  POST: define.handlers(async (ctx) => {
    const isOwner = await store.hasAccess(
      ctx.state.workspaceId,
      ctx.state.user.id,
      "owner",
    );
    if (!isOwner) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await ctx.req.json().catch(() => null)) as {
      userId?: string;
      role?: Role;
    } | null;
    const userId = body?.userId?.trim();
    const role = body?.role;
    if (!userId || (role !== "owner" && role !== "editor")) {
      return Response.json(
        { error: "Missing or invalid 'userId'/'role'" },
        { status: 400 },
      );
    }

    const user = await store.getUser(userId);
    if (!user) {
      return Response.json({ error: "Unknown user" }, { status: 404 });
    }

    try {
      const member = await store.addMember(ctx.state.workspaceId, userId, role);
      return Response.json(member, { status: 201 });
    } catch (error) {
      if (error instanceof LastOwnerError) {
        return Response.json(
          { error: "Cannot remove the last owner" },
          { status: 409 },
        );
      }
      throw error;
    }
  }),
};
