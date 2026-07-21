// Google Picker client wrapper. Loads the Picker API script lazily, opens
// the picker, and resolves with the selected documents.

export interface PickerDoc {
  id: string;
  name: string;
}

export interface PickerConfig {
  accessToken: string;
  developerKey: string;
  appId?: string;
}

// Minimal types for the parts of globalThis.gapi / google.picker we use. The
// full surface is at https://developers.google.com/picker/docs/reference.
interface PickerBuilder {
  addView(view: string): PickerBuilder;
  setOAuthToken(token: string): PickerBuilder;
  setDeveloperKey(key: string): PickerBuilder;
  setAppId(appId: string): PickerBuilder;
  setCallback(cb: (data: PickerResponse) => void): PickerBuilder;
  build(): { setVisible(visible: boolean): void };
}

interface PickerResponse {
  action: string;
  docs?: PickerDoc[];
}

interface Gapi {
  load(name: string, callback: () => void): void;
}

interface Google {
  picker: {
    PickerBuilder: new () => PickerBuilder;
    ViewId: { DOCS: string };
    Action: { PICKED: string; CANCEL: string };
  };
}

interface GlobalWithGoogleApis {
  gapi?: Gapi;
  google?: Google;
}

let gapiPromise: Promise<void> | undefined;

async function loadGapi(): Promise<void> {
  if (gapiPromise) return gapiPromise;
  gapiPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://apis.google.com/js/api.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error("Failed to load Google Picker script"));
    document.head.appendChild(script);
  });
  await gapiPromise;
}

export async function openGooglePicker(
  config: PickerConfig,
): Promise<PickerDoc[]> {
  await loadGapi();
  const g = globalThis as unknown as GlobalWithGoogleApis;
  const gapi = g.gapi;
  if (!gapi) throw new Error("gapi not loaded");
  await new Promise<void>((resolve) => gapi.load("picker", resolve));
  const picker = g.google?.picker;
  if (!picker) throw new Error("google.picker not loaded");

  return new Promise((resolve) => {
    const builder = new picker.PickerBuilder()
      .addView(picker.ViewId.DOCS)
      .setOAuthToken(config.accessToken)
      .setDeveloperKey(config.developerKey)
      .setCallback((data) => {
        if (data.action === picker.Action.PICKED) resolve(data.docs ?? []);
        else if (data.action === picker.Action.CANCEL) resolve([]);
      });
    if (config.appId) builder.setAppId(config.appId);
    builder.build().setVisible(true);
  });
}
