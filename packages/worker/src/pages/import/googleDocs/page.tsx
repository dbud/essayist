import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";

import { openGooglePicker, type PickerDoc } from "#/client/googlePicker.ts";
import GoogleSigninLink from "#/components/GoogleSigninLink.tsx";

import type { GooglePickerData } from "./data.ts";

type Status = "opening" | "cancelled" | "needsAccess" | "error";

export default function ImportGoogleDocsPage({ data }: { data: GooglePickerData }) {
  const status = useSignal<Status>(
    data.error === null ? "opening" : data.error.signInFixable ? "needsAccess" : "error",
  );
  const message = useSignal(data.error !== null ? data.error.text : "");

  useEffect(() => {
    if (data.error !== null) return;
    const config = data.config;
    if (config === null) return;

    let cancelled = false;

    void (async () => {
      let docs: PickerDoc[];
      try {
        docs = await openGooglePicker(config);
      } catch (err) {
        status.value = "error";
        message.value = err instanceof Error ? err.message : "Failed to open Google Picker";
        return;
      }
      if (cancelled) return;

      if (docs.length === 0) {
        status.value = "cancelled";
        return;
      }

      const opener = globalThis.opener;
      if (!opener) {
        status.value = "error";
        message.value = "Open this tab from the Import button in the app.";
        return;
      }
      // Hand the picked docs to the opener (main app), which runs the import.
      opener.postMessage({ type: "picked", docs }, globalThis.location.origin);
      setTimeout(() => globalThis.close(), 200);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div class="flex-1 min-h-0 flex flex-col @container">
      <div class="content-layout min-h-full">
        <div class="content-main py-5 flex flex-col gap-5">
          <h1 class="text-lg">Import from Google Docs</h1>

          {status.value === "opening" && <p class="text-ink/70">Opening Google Picker…</p>}
          {status.value === "cancelled" && (
            <p class="text-ink/70">Cancelled. You can close this tab.</p>
          )}
          {status.value === "needsAccess" && (
            <div class="max-w-prose flex flex-col gap-1">
              <p>We need permission to pick files from your Google Drive.</p>
              <p>Only the files you select are ever read.</p>
              <div class="mt-5">
                <GoogleSigninLink next="/import/google-docs" />
              </div>
            </div>
          )}
          {status.value === "error" && <p class="text-sm text-red-500">{message.value}</p>}
        </div>
      </div>
    </div>
  );
}
