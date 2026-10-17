import { useAppState } from "#/state.ts";
import { useEditorModels } from "./models";

function EditorPage() {
  const { workspaces } = useEditorModels();
  const { user } = useAppState();

  return (
    <main class="mx-auto max-w-2xl px-6 py-10 font-mono text-sm text-ink">
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
        refresh
      </button>
      {workspaces.error.value ? (
        <p class="badge badge--error">{workspaces.error.value}</p>
      ) : null}

      <h2 class="mt-6 text-ink/70">model state</h2>
      <pre class="mt-1 whitespace-pre-wrap text-xs leading-snug text-ink/70">
        {JSON.stringify(
          {
            selectedId: workspaces.selectedId.value,
            current: workspaces.current.value,
            workspaces: workspaces.list.value,
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
