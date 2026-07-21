import { define } from "@/define.ts";
import {
  exportDocAsMarkdown,
  GoogleDriveError,
  sanitizeDocTitle,
} from "@/utils/googleDrive.ts";
import { getValidAccessToken } from "@/utils/googleToken.ts";
import { getOAuthHelpers } from "@/utils/oauth.ts";

// POST { docId, name? } -> exports the Google Doc as markdown and writes it
// into the workspace VFS at `google-docs/<sanitized title>.md`. Sits under
// [wsId]/_middleware.ts so ctx.state.vfs is already resolved and access-
// checked.
export const handler = {
  POST: define.handlers(async (ctx) => {
    const body = (await ctx.req.json().catch(() => null)) as {
      docId?: string;
      name?: string;
    } | null;
    if (!body?.docId) {
      return Response.json({ error: "Missing 'docId'" }, { status: 400 });
    }

    const helpers = getOAuthHelpers(ctx.req);
    const sessionId = await helpers.getSessionId(ctx.req);
    if (!sessionId) {
      return Response.json({ error: "No session" }, { status: 401 });
    }
    const accessToken = await getValidAccessToken(sessionId);
    if (!accessToken) {
      return Response.json(
        { error: "No Google tokens on session; re-sign-in" },
        { status: 401 },
      );
    }

    let markdown: string;
    try {
      markdown = await exportDocAsMarkdown(accessToken, body.docId);
    } catch (err) {
      if (err instanceof GoogleDriveError) {
        return Response.json(
          { error: `Google export failed (${err.status})` },
          { status: 502 },
        );
      }
      throw err;
    }

    const targetPath = `google-docs/${sanitizeDocTitle(body.name ?? "untitled")}`;
    const result = await ctx.state.vfs.write(targetPath, markdown);
    return Response.json(
      { path: result.path, created: result.created },
      { status: result.created ? 201 : 200 },
    );
  }),
};
