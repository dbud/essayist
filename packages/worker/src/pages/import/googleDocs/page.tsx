import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";

import { openGooglePicker, type PickerDoc } from "#/client/googlePicker.ts";

import type { GooglePickerData } from "./data.ts";

type Status = "opening" | "cancelled" | "error";

export default function ImportGoogleDocsPage({ data }: { data: GooglePickerData }) {
  const status = useSignal<Status>(data.error !== null ? "error" : "opening");
  const message = useSignal(data.error ?? "");

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
    <div class="flex flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 class="text-lg font-thin">Import from Google Docs</h1>
      {status.value === "opening" && <p class="text-sm text-ink/70">Opening Google Picker…</p>}
      {status.value === "cancelled" && (
        <p class="text-sm text-ink/70">Cancelled — you can close this tab.</p>
      )}
      {status.value === "error" && <p class="text-sm text-red-500">{message.value}</p>}
    </div>
  );
}
