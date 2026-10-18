import { useAppState } from "#/state.ts";
import { useEditorModels } from "./models";

function EditorPage() {
  const { workspaces, fileTrees } = useEditorModels();
  const { user } = useAppState();
  const tree = fileTrees.current.value;

  return (
    <main class="mx-auto max-w-2xl px-6 py-10 text-sm text-ink">
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

      <h2 class="mt-6 text-ink/70">model state</h2>
      <pre class="mt-1 whitespace-pre-wrap text-xs leading-snug text-ink/70">
        {JSON.stringify(
          {
            selectedWorkspaceId: workspaces.selectedId.value,
            file: tree?.selectedPath.value ?? null,
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
