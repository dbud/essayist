import { useAppState } from "#/state.ts";

import { useHomeModels } from "./models";

function HomePage() {
  const { categories } = useHomeModels();
  const { user } = useAppState();

  return (
    <main class="mx-auto max-w-2xl px-6 py-10 text-sm text-ink">
      <h1 class="font-serif text-3xl text-ink">essayist</h1>
      <p class="mt-3 text-ink/70">{user ? (user.name ?? user.email) : "anonymous"}</p>
      <pre class="mt-6 max-w-lg overflow-x-auto text-xs leading-snug text-ink/70">
        {JSON.stringify(categories.list.value, null, 2)}
      </pre>
    </main>
  );
}

export default function Page() {
  return <HomePage />;
}
