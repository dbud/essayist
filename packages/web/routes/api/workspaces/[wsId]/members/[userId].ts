import { LastOwnerError } from "@essayist/core";
import { define } from "@/define.ts";
import { store } from "@/store.ts";

export const handler = {
  // Only owners can remove members.
  DELETE: define.handlers(async (ctx) => {
    const { userId } = ctx.params;

    const isOwner = await store.hasAccess(
      ctx.state.workspaceId,
      ctx.state.user.id,
      "owner",
    );
    if (!isOwner) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    try {
      const removed = await store.removeMember(ctx.state.workspaceId, userId);
      if (!removed) {
        return Response.json({ error: "Not a member" }, { status: 404 });
      }
      return new Response(null, { status: 204 });
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
