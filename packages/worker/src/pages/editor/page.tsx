import FileNavigation from "#/components/editor/FileNavigation.tsx";
import Navigation from "#/components/Navigation.tsx";
import { Toaster } from "#/components/Toaster.tsx";
import { useAppState } from "#/state.ts";
import { useEditorModels } from "./models";

function EditorPage() {
  const { workspaces, fileTrees, fileContents, categories } = useEditorModels();
  const { user } = useAppState();
  const tree = fileTrees.current.value;
  const file = fileContents.current.value;

  return (
    <main class="flex flex-1 flex-col min-h-0 @container text-ink stack stack--col">
      <Navigation user={user}>
        <FileNavigation />
      </Navigation>

      <div class="content-main bg-paper">
        {file === null ? (
          <p class="text-ink/70">no file selected</p>
        ) : file.content.value === null ? (
          <p class="text-ink/70">{file.loading.value ? "loading" : "empty"}</p>
        ) : (
          <div class="mt-5">
            <textarea
              class="h-48 w-full border border-black/10 p-5 font-mono text-xs"
              value={file.content.value}
              onInput={(e) => {
                file.content.value = e.currentTarget.value;
              }}
            ></textarea>
            <button
              class="btn btn--ghost mt-2"
              type="button"
              disabled={file.saving.value || !file.dirty.value}
              onClick={() => void file.save()}
            >
              save draft
            </button>
            {file.dirty.value ? (
              <span class="ms-2 text-ink/60">unsaved</span>
            ) : null}
            {file.saving.value ? (
              <span class="ms-2 text-ink/60">saving</span>
            ) : null}
            {file.saveError.value ? (
              <p class="badge badge--error">{file.saveError.value}</p>
            ) : null}
            {file.error.value ? (
              <p class="badge badge--error">{file.error.value}</p>
            ) : null}
          </div>
        )}

        <pre class="whitespace-pre-wrap text-xs leading-snug text-ink/70 mt-10">
          {JSON.stringify(
            {
              file: tree?.selectedPath.value ?? null,
              version: file?.version.value?.version_id ?? null,
              draft: file?.draft.value?.timestamp ?? null,
              dirty: file?.dirty.value ?? false,
            },
            null,
            2,
          )}
        </pre>
      </div>
    </main>
  );
}

export default function Page() {
  return (
    <>
      <EditorPage />
      <Toaster />
    </>
  );
}
