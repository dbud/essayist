/**
 * The Google Picker tab's per-session payload: the user's drive.file
 * access token plus the public picker credentials. The Google Picker is
 * a client-only library, so it needs an OAuth token client-side; the
 * developerKey is a public API key whose abuse envelope is referrer +
 * API restrictions in the Cloud Console. The client secret stays
 * server-side.
 */

import type { AuthStore } from "@essayist/core";
import { Effect, Schema } from "effect";
import { getValidAccessToken } from "#/auth/token.ts";
import { GoogleConfig } from "#/env.ts";

export const PickerConfig = Schema.Struct({
  accessToken: Schema.String,
  developerKey: Schema.String,
  appId: Schema.optional(Schema.String),
});
export type PickerConfig = Schema.Schema.Type<typeof PickerConfig>;

/** The picker session cannot be resolved. */
export class PickerConfigError extends Schema.TaggedError<PickerConfigError>()(
  "PickerConfigError",
  { reason: Schema.String },
) {
  override get message() {
    return this.reason;
  }
}

/** Resolve the picker tab's payload for one authenticated session. */
export const pickerConfig = (
  sessionId: string | undefined,
): Effect.Effect<PickerConfig, PickerConfigError, GoogleConfig | AuthStore> =>
  Effect.gen(function* () {
    const config = yield* GoogleConfig;
    if (config.apiKey === undefined) {
      return yield* Effect.fail(
        new PickerConfigError({
          reason: "Google Picker not configured (set GOOGLE_API_KEY)",
        }),
      );
    }
    if (config.clientId === undefined || config.clientSecret === undefined) {
      return yield* Effect.fail(
        new PickerConfigError({ reason: "Google sign-in is not configured" }),
      );
    }
    if (sessionId === undefined) {
      return yield* Effect.fail(
        new PickerConfigError({ reason: "No session" }),
      );
    }
    const accessToken = yield* getValidAccessToken(
      sessionId,
      config.clientId,
      config.clientSecret,
    ).pipe(
      Effect.catchTag("PersistenceError", (err) => Effect.die(err)),
      Effect.catchTag("TokenRefreshError", () =>
        Effect.fail(
          new PickerConfigError({
            reason: "Google token refresh failed; please sign in again",
          }),
        ),
      ),
    );
    if (accessToken === undefined) {
      return yield* Effect.fail(
        new PickerConfigError({
          reason: "No Google tokens on session; re-sign-in",
        }),
      );
    }
    return {
      accessToken,
      developerKey: config.apiKey,
      ...(config.appId !== undefined && { appId: config.appId }),
    };
  });
