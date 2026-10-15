import type { JSX } from "preact";
import { Toaster } from "#/components/Toaster.tsx";
import { type HomeModels, HomeModelsProvider, useHomeModels } from "./models";

function Counter() {
  const votes = useHomeModels().votes;
  return (
    <div class="mt-6">
      <p class="text-sm text-ink/70">{votes.summary.value}</p>
      <p class="mt-2 flex items-center gap-1">
        <button
          class="h-9 w-9 bg-paper text-lg text-ink"
          type="button"
          onClick={votes.dec}
        >
          -
        </button>
        <span class="min-w-8 px-2 text-center font-mono text-ink">
          {votes.count.value}
        </span>
        <button
          class="h-9 w-9 bg-ink text-lg text-paper"
          type="button"
          onClick={votes.inc}
        >
          +
        </button>
        <button
          class="btn btn--ghost ms-2"
          type="button"
          disabled={votes.refreshing.value}
          onClick={votes.refresh}
        >
          refresh
        </button>
      </p>
      {votes.refreshing.value ? (
        <p class="mt-1 text-sm text-ink/50">refreshing</p>
      ) : null}
      {votes.refreshError.value ? (
        <p class="badge badge--error mt-1">{votes.refreshError.value}</p>
      ) : null}
      {import.meta.env.DEV ? (
        <button class="btn btn--ghost mt-2" type="button" onClick={votes.chaos}>
          chaos {votes.chaosArmed.value ? "armed" : "idle"}
        </button>
      ) : null}
    </div>
  );
}

export function HomePage(): JSX.Element {
  const models = useHomeModels();
  return (
    <main class="mx-auto max-w-2xl px-6 py-10 font-sans">
      <h1 class="font-serif text-3xl text-ink">essayist</h1>
      <p class="mt-3 max-w-lg text-ink/80">{models.pageInfo.message.value}</p>
      <p class="mt-1 text-sm text-ink/50">
        rendered by hono + preact at {models.pageInfo.renderedAt.value}
      </p>
      <Counter />
    </main>
  );
}

export function HomeTree(models: HomeModels): JSX.Element {
  return (
    <HomeModelsProvider value={models}>
      <HomePage />
      <Toaster />
    </HomeModelsProvider>
  );
}
