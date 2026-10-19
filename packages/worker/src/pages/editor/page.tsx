import Navigation from "#/components/Navigation.tsx";
import { useAppState } from "#/state.ts";
import { useEditorModels } from "./models";

function EditorPage() {
  const { workspaces, fileTrees, fileContents, categories } = useEditorModels();
  const { user } = useAppState();
  const tree = fileTrees.current.value;
  const file = fileContents.current.value;

  return (
    <main class="flex flex-1 flex-col min-h-0 @container text-ink stack stack--col">
      <Navigation user={user} />
      <h1 class="font-serif text-2xl text-ink">editor prototype</h1>
      <p class="mt-2 text-ink/70">
        {user ? (user.name ?? user.email) : "anonymous"}
      </p>

      <h2 class="mt-6 text-ink/70">workspaces</h2>
      <ul class="mt-1 list-disc ps-6">
        {workspaces.list.value.map((workspace) => (
          <li key={workspace.id}>
            <button
              class="underline"
              type="button"
              disabled={workspaces.loading.value}
              onClick={() => workspaces.select(workspace.id)}
            >
              {workspaces.selectedId.value === workspace.id
                ? `[x] ${workspace.name}`
                : workspace.name}
            </button>
          </li>
        ))}
      </ul>
      <button
        class="btn btn--ghost mt-2"
        type="button"
        disabled={workspaces.loading.value}
        onClick={() => void workspaces.refresh()}
      >
        refresh workspaces
      </button>
      <button
        class="btn btn--ghost ms-2"
        type="button"
        disabled={tree?.loading.value ?? true}
        onClick={() => void tree?.load()}
      >
        refresh files
      </button>
      {workspaces.error.value ? (
        <p class="badge badge--error">{workspaces.error.value}</p>
      ) : null}
      {tree?.error.value ? (
        <p class="badge badge--error">{tree.error.value}</p>
      ) : null}

      <h2 class="mt-6 text-ink/70">files</h2>
      <ul class="mt-1 list-disc ps-6">
        {tree === null
          ? null
          : tree.files.value.map((file) => (
              <li key={file.path}>
                <button
                  class="underline"
                  type="button"
                  onClick={() => tree.select(file.path)}
                >
                  {file.path === tree.selectedPath.value
                    ? `[x] ${file.path}`
                    : file.path}
                </button>
                {` (${file.lines} lines)`}
              </li>
            ))}
      </ul>

      <h2 class="mt-6 text-ink/70">content</h2>
      {file === null ? (
        <p class="text-ink/70">no file selected</p>
      ) : file.content.value === null ? (
        <p class="text-ink/70">{file.loading.value ? "loading" : "empty"}</p>
      ) : (
        <div class="mt-1">
          <textarea
            class="h-48 w-full rounded border border-black/10 p-2 font-mono text-xs"
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

      <h2 class="mt-6 text-ink/70">model state</h2>
      <pre class="mt-1 whitespace-pre-wrap text-xs leading-snug text-ink/70">
        {JSON.stringify(
          {
            selectedId: workspaces.selectedId.value,
            file: tree?.selectedPath.value ?? null,
            version: file?.version.value?.version_id ?? null,
            draft: file?.draft.value?.timestamp ?? null,
            dirty: file?.dirty.value ?? false,
            categories: categories.list.value,
          },
          null,
          2,
        )}
      </pre>
    </main>
  );
}

export default function Page() {
  return <EditorPage />;
}
