import { Effect } from "effect";
import { Hono } from "hono";
import { pickerConfig } from "#/auth/pickerConfig.ts";
import { env } from "#/env.ts";
import { runtime } from "#/runtime.ts";
import type { GooglePickerData } from "./data.ts";
import ImportGoogleDocsPage from "./page.tsx";

export default new Hono().get("/", async (c) => {
  const e = env(c.env);
  const data: GooglePickerData = await runtime(e).runPromise(
    pickerConfig(c.get("auth-session-id")).pipe(
      Effect.map((config) => ({ error: null, config })),
      Effect.catchTag("PickerConfigError", (err) =>
        Effect.succeed({ error: err.reason, config: null }),
      ),
    ),
  );
  return c.render(<ImportGoogleDocsPage data={data} />, {
    title: "import google docs",
    client: "importGoogleDocs",
    data,
  });
});
