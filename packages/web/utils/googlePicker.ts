// Google Picker client wrapper: opens the picker and resolves with the
// selected documents.

export interface PickerDoc {
  id: string;
  name: string;
}

export interface PickerConfig {
  accessToken: string;
  developerKey: string;
  appId?: string;
}

let gapiPromise: Promise<void> | undefined;

async function loadGapi(): Promise<void> {
  if (gapiPromise) return gapiPromise;
  gapiPromise = new Promise((resolve, reject) => {
    if (typeof gapi !== "undefined") {
      resolve();
      return;
    }
    const script = document.querySelector<HTMLScriptElement>(
      'script[src="https://apis.google.com/js/api.js"]',
    );
    if (!script) {
      reject(new Error("Google Picker script not on this page"));
      return;
    }
    script.addEventListener("load", () => resolve());
    script.addEventListener("error", () =>
      reject(new Error("Failed to load Google Picker script")),
    );
  });
  await gapiPromise;
}

export async function openGooglePicker(
  config: PickerConfig,
): Promise<PickerDoc[]> {
  await loadGapi();
  await new Promise<void>((resolve) => gapi.load("picker", resolve));

  return new Promise((resolve) => {
    const docsView = (viewId: google.picker.ViewId) =>
      new google.picker.DocsView(viewId).setMode(
        google.picker.DocsViewMode.LIST,
      );
    const builder = new google.picker.PickerBuilder()
      .addView(docsView(google.picker.ViewId.DOCUMENTS))
      .addView(docsView(google.picker.ViewId.PDFS))
      .enableFeature(google.picker.Feature.MULTISELECT_ENABLED)
      .enableFeature(google.picker.Feature.MINE_ONLY)
      .enableFeature(google.picker.Feature.NAV_HIDDEN)
      .setOAuthToken(config.accessToken)
      .setDeveloperKey(config.developerKey)
      .setCallback((data) => {
        const action = data[google.picker.Response.ACTION];
        if (action === google.picker.Action.PICKED) {
          const docs = data[google.picker.Response.DOCUMENTS] ?? [];
          resolve(
            docs.map((d) => ({
              id: d[google.picker.Document.ID],
              name: d[google.picker.Document.NAME] ?? "",
            })),
          );
        } else if (action === google.picker.Action.CANCEL) {
          resolve([]);
        }
      });
    if (config.appId) builder.setAppId(config.appId);
    builder.build().setVisible(true);
  });
}
