/**
 * The google-docs import flow for the workspace api: resolve the session's Google access token,
 * export the doc as markdown, and write it into the workspace under google-docs/, mapping failures
 * to api errors.
 */

import { type AuthStore, Files, WorkspaceId } from "@essayist/core";
import { Effect, Option } from "effect";
import { HttpApiError } from "effect/http-api";

import { ApiFailure, ApiTooLarge } from "#/api/errors.ts";
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
  { path: string; created: boolean },
  HttpApiError.Unauthorized | ApiFailure | ApiTooLarge,
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
      // A failed refresh is repairable with a fresh sign-in, so the client gets the 401 fail-fast
      // path instead of a per-document failure.
      Effect.catchTag("TokenRefreshError", () => Effect.fail(new HttpApiError.Unauthorized({}))),
    );
    if (Option.isNone(accessToken)) {
      return yield* Effect.fail(new HttpApiError.Unauthorized({}));
    }
    const markdown = yield* exportDocAsMarkdown(accessToken.value, docId).pipe(
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
    const { created } = yield* files.writeAt(targetPath, markdown).pipe(
      Effect.provideService(WorkspaceId, { wsId }),
      Effect.catchTag("FileTooLargeError", (error) =>
        Effect.fail(new ApiTooLarge({ message: error.message })),
      ),
    );
    return { path: targetPath, created };
  });
}
