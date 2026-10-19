/**
 * The google-docs import flow for the workspace api: resolve the
 * session's Google access token, export the doc as markdown, and write
 * it into the workspace VFS under google-docs/. Failures carry the api
 * error shapes so group handlers stay thin.
 */

import {
  type AuthStore,
  Files,
  WorkspaceId,
  type WriteResult,
} from "@essayist/core";
import { Effect } from "effect";
import { HttpApiError } from "effect/http-api";
import { getValidAccessToken } from "#/auth/token.ts";
import { GoogleConfig } from "#/env.ts";
import { exportDocAsMarkdown, sanitizeDocTitle } from "#/utils/googleDrive.ts";

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
  HttpApiError.Unauthorized | HttpApiError.ServiceUnavailable,
  AuthStore | GoogleConfig | Files
> {
  return Effect.gen(function* () {
    const config = yield* GoogleConfig;
    const files = yield* Files;
    if (config.clientId === undefined || config.clientSecret === undefined) {
      return yield* Effect.fail(new HttpApiError.ServiceUnavailable({}));
    }
    const accessToken = yield* getValidAccessToken(
      sessionId,
      config.clientId,
      config.clientSecret,
    ).pipe(
      Effect.catchTag("PersistenceError", (err) => Effect.die(err)),
      Effect.catchTag("TokenRefreshError", () =>
        Effect.fail(new HttpApiError.ServiceUnavailable({})),
      ),
    );
    if (accessToken === undefined) {
      return yield* Effect.fail(new HttpApiError.Unauthorized({}));
    }
    const markdown = yield* exportDocAsMarkdown(accessToken, docId).pipe(
      Effect.catchTag("GoogleDriveError", (err) =>
        Effect.fail(
          err.status === 401 || err.status === 403
            ? new HttpApiError.Unauthorized({})
            : new HttpApiError.ServiceUnavailable({}),
        ),
      ),
    );
    const targetPath = `google-docs/${sanitizeDocTitle(name ?? "untitled")}`;
    return yield* files
      .write(targetPath, markdown)
      .pipe(Effect.provideService(WorkspaceId, { wsId }), Effect.orDie);
  });
}
