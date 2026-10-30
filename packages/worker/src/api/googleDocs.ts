/**
 * The google-docs import flow for the workspace api: resolve the session's Google access token,
 * export the doc as markdown, and write it into the workspace VFS under google-docs/. Failures map
 * to the api error shapes; group handlers stay simple.
 */

import { type AuthStore, Files, WorkspaceId, type WriteResult } from "@essayist/core";
import { Effect } from "effect";
import { HttpApiError } from "effect/http-api";

import { ApiFailure } from "#/api/errors.ts";
import { getValidAccessToken } from "#/auth/token.ts";
import { GoogleConfig } from "#/env.ts";
import { exportDocAsMarkdown, sanitizeDocTitle } from "#/utils/googleDrive.ts";

const unconfiguredMessage =
  "Google Docs import is not configured; set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET";

export interface ImportGoogleDocInput {
  readonly sessionId: string;
  readonly wsId: string;
  readonly docId: string;
  readonly name?: string | undefined;
}

export function importGoogleDocFile({
  sessionId,
  wsId,
  docId,
  name,
}: ImportGoogleDocInput): Effect.Effect<
  WriteResult,
  HttpApiError.Unauthorized | ApiFailure,
  AuthStore | GoogleConfig | Files
> {
  return Effect.gen(function* () {
    const config = yield* GoogleConfig;
    const files = yield* Files;
    if (config.clientId === undefined || config.clientSecret === undefined) {
      return yield* Effect.fail(new ApiFailure({ message: unconfiguredMessage }));
    }
    const accessToken = yield* getValidAccessToken(
      sessionId,
      config.clientId,
      config.clientSecret,
    ).pipe(
      Effect.catchTag("PersistenceError", (err) => Effect.die(err)),
      // A failed refresh is repairable with a fresh sign-in, so the client gets the 401 fail-fast
      // path instead of a per-document failure.
      Effect.catchTag("TokenRefreshError", () => Effect.fail(new HttpApiError.Unauthorized({}))),
    );
    if (accessToken === undefined) {
      return yield* Effect.fail(new HttpApiError.Unauthorized({}));
    }
    const markdown = yield* exportDocAsMarkdown(accessToken, docId).pipe(
      Effect.catchTag("GoogleDriveError", (err) =>
        Effect.fail(
          err.status === 401
            ? new HttpApiError.Unauthorized({})
            : new ApiFailure({
                message:
                  err.status === 0
                    ? "could not reach Google Drive"
                    : `Google Drive rejected the export (${err.status})`,
              }),
        ),
      ),
    );
    const targetPath = `google-docs/${sanitizeDocTitle(name ?? "untitled")}`;
    return yield* files
      .write(targetPath, markdown)
      .pipe(Effect.provideService(WorkspaceId, { wsId }), Effect.orDie);
  });
}
